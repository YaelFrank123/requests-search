> **ארכיון — אינו מקור אמת.**
> מסמך תכנון מוקדם שערבב דרישות, עיצוב, החלטות ומשימות בקובץ אחד, ולכן צבר סתירות פנימיות.
> הוחלף על ידי `specs/requirements.md` (ה-WHAT) וקבצי `specs/design-*.md` (ה-HOW).
> נשמר כתיעוד של תהליך התכנון בלבד.

---

<div dir="rtl" style="text-align: right;">

# תוכנית ארכיטקטורה – מבחן מקצועי (Senior .NET / AWS / Microservices / Clean Architecture)

## הקשר (Context)

זהו מסמך תכנון בלבד — **ללא קוד** — לקראת מבחן הבית המצורף בתיקייה `C:\Users\me\Downloads\CandidateTest`. הזמן הכולל למבחן הוא עד 3 שעות, והמבחן עצמו כולל שלושה חלקים: מימוש Feature (חיפוש/סינון ל-Requests), תכנון ארכיטקטורת Microservices, ותכנון פריסה ב-Cloud (AWS). המטרה של המסמך הזה היא לענות על 6 הסעיפים שביקשת: רכיבי מערכת, ארכיטקטורה, מבנה Solution, זרימה בין רכיבים, שירותי AWS, ונקודות החלטה פתוחות עם יתרונות/חסרונות. לאחר אישור התוכנית — נעבור למימוש בפועל.

### מה כבר קיים ברפו (ממצאי סקירה)

הרפו כבר מכיל שלד Clean Architecture נכון אך דק מאוד, בלי `.sln`, בלי `appsettings.json`, בלי README, ולא תחת git:

```
Requests.Domain          (ללא תלויות)     — Entity: Request (9 שדות), enums: RequestStatus, RequestType
   ↑
Requests.Application     (תלוי ב-Domain)   — IRequestRepository.GetAllAsync בלבד, RequestService, RequestDto
   ↑
Requests.Infrastructure  (EF Core InMemory) — RequestsDbContext (DbSet יחיד, ללא OnModelCreating), DbSeeder (500 רשומות), RequestRepository
   ↑
Requests.Api             (Swashbuckle)      — RequestsController עם GET יחיד ללא פרמטרים, "משתמש נוכחי" מגיע מ-headers (X-User-Id / X-Is-Admin)
```

פערים מרכזיים מול הדרישות:
- **הסינון וההרשאות מתבצעים היום In-Memory** (`GetAllAsync()` → `ToListAsync()` מלא, ואז LINQ-to-Objects) — לא נדחפים ל-DB בכלל. זה מתנגש ישירות עם "יש להניח מיליוני רשומות".
- Provider יחיד הוא EF Core **InMemory** — אין ספק SQL אמיתי, אין Migrations, אין אינדקסים.
- 500 רשומות בלבד קיימות (לא מיליונים).
- אין Entity ל-`User`/`Customer` — `OwnerId`/`AssignedToUserId`/`CustomerId` הם `int` גולמיים בלי FK.
- אין Frontend בכלל — צריך לבנות מאפס (Angular/React).
- קיימים 2 טסטים ב-`RequestServiceTests.cs` שממחישים את סמנטיקת ההרשאות הנוכחית (owner/assignee/admin) — יצטרכו להיכתב מחדש כשהסינון יעבור ל-DB.

---

## 1. רכיבי המערכת המרכזיים

**מה שחלק א' נוגע בו, לפי שכבה:**

| שכבה | מה מתווסף |
|---|---|
| Domain | כמעט ללא שינוי — סינון/מיון/עימוד הם ענייני Query, לא invariants של הדומיין |
| Application | Query Model לחיפוש, `PagedResult<T>`, הפשטת `ICurrentUser`, הרחבת חוזי Repository/Service |
| Infrastructure | הרכבת `IQueryable` בפועל (הרשאות + סינון + מיון + עימוד), הגדרת אינדקסים ב-`OnModelCreating` |
| Api | Binding לפרמטרי Query String, מימוש קונקרטי ל-`ICurrentUser`, Validation → 400, CORS, Exception middleware |
| Frontend (חדש) | טופס סינון, טבלת תוצאות, מיון, עימוד, מצבי טעינה/שגיאה/ריק |

**איך 5 התחומים העתידיים של חלק ב' מתקשרים למה שכבר קיים:**
- **Requests** = מה שכבר קיים; הופך ל-Bounded Context/שירות עצמאי עם DB משלו.
- **Customers** — היום זה רק `CustomerId int` בלי Entity בכלל. בפועל זו התחלה נוחה: אין JOIN ברמת ה-DB שצריך "לפרק" כשCustomers יהפוך לשירות נפרד.
- **Notifications** — לא קיים היום; זה הפוקוס המפורש של תרחיש האמינות בחלק ב'.
- **Documents** — לא קיים; ככל הנראה קבצים המצורפים ל-Request, מגובים ע"י Object Storage + metadata, מקושרים רק דרך `RequestId`.
- **Reporting** — לא קיים; Consumer טבעי של אירועים מהשירותים האחרים (CQRS-style), לא מישהו שקוראים לו סינכרונית.
- **נקודה שכדאי לציין מול הבוחן**: הרשימה הרשמית לא מזכירה "Users/Identity" בנפרד, למרות ש-`OwnerId`/`AssignedToUserId` וכל מודל ההרשאות מניחים את קיומו. שווה להציג את זה כפער מודע ברשימת הדומיינים המקורית.

---

## 2. ארכיטקטורה מוצעת לחלק א' (Feature: חיפוש/סינון)

### Backend

**Application layer** (`Requests.Application`):
- `RequestSearchQuery` — record: `RequestNumber?`, `Statuses` (collection — הדרישה אומרת יחיד-או-מרובה), `RequestType?`, `CreatedFrom?`/`CreatedTo?`, `SortBy`, `SortDirection`, `Page`, `PageSize`.
- `PagedResult<T>` — עטיפה גנרית: `Items`, `TotalCount`, `Page`, `PageSize`. כדאי תיקיית `Common/` חדשה (היום הכל שטוח תחת `Requests/`).
- `ICurrentUser` — `int UserId`, `bool IsAdministrator`. **זהו התפר האדריכלי המרכזי**: היום מתמלא מ-headers, מחר מ-JWT claims — ושום דבר מתחת ל-Application לא צריך לדעת מאיפה. הנקודה הכי "quotable" בראיון המשך.
- `IRequestRepository` — במקום להוסיף `SearchAsync` *לצד* `GetAllAsync` הקיים, **להחליף** את `GetAllAsync` לגמרי. נתיב לא-מסונן שנשאר בר-קריאה הוא בדיוק סוג הבאג ש"אכיפה בצד שרת" אמור למנוע.
- `IRequestService` — `SearchAsync(RequestSearchQuery, CancellationToken)`, כשה-`ICurrentUser` מוזרק ולא מגיע כפרמטרים גולמיים.
- Validation — guard clauses ידניים (ברירת מחדל פרגמטית לתקציב של 3 שעות; FluentValidation הוא חלופה "נקייה" יותר אם כבר שולטים בה — Tradeoff קטן, לא כלל ברזל). כללים: `CreatedFrom <= CreatedTo`; `Page >= 1`; `PageSize` חסום (למשל 1–100, ברירת מחדל ~20-25); ערך enum לא תקין → 400 ולא התעלמות שקטה; אורך מקסימלי ל-`RequestNumber`.
- **Sort allow-list** — מיפוי סטטי מ-sort keys מורשים (`requestNumber`, `status`, `requestType`, `createdAt`) לביטויים טיפוסיים, ברירת מחדל `CreatedAt desc`. נמנעים ממיון דינמי מבוסס-Reflection.
- **השפעה על הטסטים הקיימים** — שני ה-`[Fact]` ב-`RequestServiceTests.cs` בודקים `GetRequestsAsync` מול `FakeRequestRepository.GetAllAsync`. כשהסינון עובר ל-`SearchAsync`, הם צריכים להיכתב מחדש במפורש — ולתעד בבירור שזו **החלפה מכוונת**, לא מחיקה סתמית (עם המשפט: "סינון ההרשאות עבר מ-LINQ אחרי-שליפה ל-Query layer כדי לעמוד בדרישת מיליוני הרשומות").

**Infrastructure layer** (`Requests.Infrastructure`):
- `RequestRepository.SearchAsync` מרכיב `IQueryable<Request>` בסדר קבוע: `AsNoTracking()` → תנאי הרשאות **תמיד ראשון וללא תנאי** (`OwnerId == currentUser.UserId || AssignedToUserId == currentUser.UserId`, מדולג לגמרי ל-Admin) → כל פילטר מתווסף רק `if` הערך סופק בפועל (נמנעים מ-`WHERE x = NULL OR ...` שהורג אינדקסים) → `CountAsync` לפני עימוד → מיון + `Skip/Take` → `.Select()` ישירות ל-DTO (לא לטעון Entities מלאים) → `ToListAsync`. שני round-trips ל-DB (count + page) זה תקין ונפוץ.
- `OnModelCreating` (היום ריק לגמרי) — להגדיר אינדקסים לפי צורת השאילתות בפועל: `RequestNumber`, composite `(OwnerId, CreatedAt)` ו-`(AssignedToUserId, CreatedAt)` (לנתיב ההרשאות), single-column על `Status`/`RequestType`/`CreatedAt`. גם אם נשארים על InMemory (ר' החלטה פתוחה i) — כדאי להגדיר בכל מקרה ולציין בפירוש ש"InMemory לא אוכף/מנצל את זה בפועל".
- **"התאמה חלקית" ל-RequestNumber — Tradeoff שכדאי להבליט ולא להחליק מעליו**: "חיפוש חלקי" נקרא כ-`Contains` (`LIKE '%x%'`), שאינו sargable על אינדקס B-tree רגיל (wildcard מוביל שובר אינדקס). שלוש אפשרויות: (א) `Contains` כפי שנכתב מילולית + לתעד את המגבלה בקנה מידה גדול; (ב) `StartsWith` (`LIKE 'x%'`, כן sargable) + לתעד סטייה קטנה מהניסוח; (ג) לתאר (לא לממש) Full-text/Trigram (Postgres `pg_trgm`) או אינדקס חיפוש ייעודי (OpenSearch) כפתרון production אמיתי. **מומלץ: (א)** לנאמנות למילה המדויקת, עם התיעוד — זה בדיוק סוג המודעות ל-Tradeoffs שהמסמך עצמו (סעיף "נקודה אחרונה") מתגמל.

**API layer** (`Requests.Api`):
- Controller מקבל `[FromQuery]` — ASP.NET Core כבר יודע לקשור `?status=New&status=InProgress` ל-`List<RequestStatus>` בלי Binder מותאם אישית.
- **שכבת Auth** (✅ הוחלט — אופציה B, ר' סעיף 6.ii): `AddAuthentication().AddJwtBearer(...)` הסטנדרטי של ASP.NET Core — לא Handler מותאם אישית. `TokenValidationParameters` מאמת חתימה (מפתח מ-`Jwt:Key`), Issuer, Audience, ותוקף. `AuthController` חדש חושף `POST api/auth/login`, מאמת מול `AppUser` ב-DB (ר' Infrastructure), ומנפיק Token דרך `IJwtTokenGenerator`. `RequestsController` מקבל `[Authorize]` ברמת המחלקה — קריאה בלי Token תקין/פג-תוקף נכשלת עם 401 סטנדרטי.
- `ICurrentUser` מקבל מימוש קונקרטי, `ClaimsCurrentUserAccessor` (`Requests.Api/Security/ClaimsCurrentUserAccessor.cs`), שקורא Claims מ-`HttpContext.User` — נשאר **זהה בדיוק** בין אם ה-Claims הגיעו מ-Header מדומה (C, ננטש) או מ-JWT אמיתי (B, נבחר) — זו בדיוק הנקודה שמוכיחה שההפשטה הזו הייתה נכונה מלכתחילה.
- Exception-handling middleware → ProblemDetails (לא קיים היום — Exception לא מטופל מחזיר היום 500 גולמי).
- CORS policy לצורך ה-Frontend (גם לא קיים היום) — לפני `MapControllers()`.
- **את "דליפת השכבות" הקיימת ב-`Program.cs`** (פונה ישירות ל-`RequestsDbContext`/`DbSeeder` ולא רק ל-`AddInfrastructure()`) — להשאיר כמות שהיא ולתעד כ-Shortcut מודע ב-README, לא "לתקן" ולבזבז זמן.

### Frontend — ✅ הוחלט: Angular + Angular Material

1. **API client module** — `HttpClient` בשירות Angular ייעודי (`RequestsApiService`), בונה query string ממצב הפילטרים. `HttpInterceptor` **אחד** גלובלי (`authInterceptor`) מצרף `Authorization: Bearer <token>` לכל בקשה יוצאת מתוך `AuthService` — כך שאף Component לא נוגע ב-Token בעצמו. אותו Interceptor גם תופס תגובות 401 (Token פג/לא תקין), מנקה את ה-Session ומפנה ל-Login עם הודעה ברורה (ר' סעיף 6.ii — טיפול יפה בפקיעה, בלי Refresh Token).
2. **טופס סינון** — `ReactiveFormsModule` (`FormGroup`): `mat-input` ל-Request Number, `mat-select` עם `multiple` ל-Status, `mat-select` יחיד ל-Request Type, `mat-date-range-input` (Material) לטווח תאריכים. אימות `from<=to` גם כ-Validator בצד לקוח (feedback מהיר), ה-Backend נשאר מקור האמת.
3. **בקרת מיון** — `matSort` על `mat-table` + `mat-sort-header` בכותרות העמודות — נותן UI מיון "בחינם" בלי לבנות ידנית.
4. **טבלת תוצאות** — `mat-table` + `MatTableDataSource`. **נקודה קריטית לזכור**: ברירת המחדל של `MatTableDataSource` היא מיון/עימוד **בצד לקוח** על מערך שכבר נטען. מכיוון שאצלנו העימוד/המיון חייבים לקרות בצד שרת (דרישת מיליוני הרשומות) — **לא** מחברים את `MatTableDataSource` למקור הנתונים המובנה שלה; במקום זה, אירועי `(page)` מה-`mat-paginator` ו-`(matSortChange)` מה-`matSort` רק מעדכנים את ה-state (Page/SortBy/SortDirection) וגורמים לקריאת HTTP חדשה, ו-`dataSource.data` מתעדכן רק עם השורות של העמוד הנוכחי שחזרו מהשרת.
5. **עימוד** — `mat-paginator`, עם `length` שמוזן מ-`totalCount` שמגיע מהתגובה (לא מאורך המערך המקומי!), ו-`pageSize`/`pageIndex` מסונכרנים ל-`Page`/`PageSize` בבקשה.
6. **מצבי טעינה/שגיאה/ריק מפורש** — `mat-progress-spinner`/`mat-progress-bar` לטעינה, `MatSnackBar` או בלוק שגיאה inline לשגיאות, מצב "אין תוצאות התואמות לסינון" מפורש כשה-Array ריק (לא טבלה ריקה סתם) — נדרש במפורש במבחן.
7. **קונטיינר עמוד החיפוש** — Component אחד מחזיק את כל ה-state (פילטר/מיון/עמוד); `form.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), switchMap(...))` נותן גם Debounce וגם ביטול בקשות קודמות "בחינם" דרך RxJS.
8. **מסך Login אמיתי** (✅ הוחלט — אופציה B, ר' סעיף 6.ii) — טופס Username+Password, קורא ל-`AuthService.login(...)`, מציג שגיאה ברורה על קרדנציאלס שגויים. הצלחה → Angular Router מנווט מ-`/login` ל-`/search`; `/search` מוגן ב-`authGuard` (בודק Token תקף לפני מתן גישה, אחרת מפנה חזרה ל-`/login`). **בלי** כפתורי-קיצור להתחברות מדומה — הדגמת הרשאות שונות בין Admin למשתמש Regular עוברת דרך הקלדה אמיתית של קרדנציאלס לאחד המשתמשים שנזרעו מראש.

**הקמה**: `ng new frontend --style=scss` (**בלי** `--routing=false` — נדרש Angular Router אמיתי, ר' 6.ii) בתוך `CandidateTest/`, ואז `ng add @angular/material`. שווה לתעד ב-README את הפקודות האלה תחת "איך מריצים את ה-Frontend".

**"מיליוני רשומות" בפועל**: עימוד תמיד בצד שרת; תנאי סינון מותנים (לא Blanket); `AsNoTracking()`; Projection ברמת ה-DB; אינדקסים שמותאמים לעמודות הסינון/מיון/הרשאות בפועל; `Skip/Take` מספיק למסך חיפוש רגיל — keyset/seek pagination מתועד כ"הצעד הבא" לעמודים עמוקים מאוד, לא מיושם עכשיו.

---

## 3. מבנה Solution ופרויקטים מוצע

**להשאיר כמו שזה ולהרחיב** — גרף התלויות הקיים (`Requests.Domain` ← `Requests.Application` ← `Requests.Infrastructure` ← `Requests.Api`, + `Requests.Tests`) כבר Clean Architecture נכון והפוך-תלויות כראוי. לשנות מבנה שכבר נכון = בזבוז זמן ואות רע לבוחן.

**מה להוסיף** (יחסית ל-`C:\Users\me\Downloads\CandidateTest`):
- **`Requests.sln`** בשורש — לא קיים היום כלל; נדרש כדי ש-`dotnet build`/`dotnet test` וה"איך מריצים" ב-README יהיו טריוויאליים.
- **`src/Requests.Api/appsettings.json`** (+ `appsettings.Development.json`) — היום הכל hardcoded ב-`DependencyInjection.cs`. נדרש לפחות ל-CORS origins, ואם עוברים מ-InMemory (החלטה פתוחה i) — גם connection string.
- **`src/Requests.Application/Requests/RequestSearchQuery.cs`** (או תיקיית `Requests/Search/` חדשה).
- **`src/Requests.Application/Common/PagedResult.cs`**, **`src/Requests.Application/Common/ICurrentUser.cs`**.
- עדכון במקום: [IRequestRepository.cs](CandidateTest/src/Requests.Application/Requests/IRequestRepository.cs), [IRequestService.cs](CandidateTest/src/Requests.Application/Requests/IRequestService.cs), [RequestService.cs](CandidateTest/src/Requests.Application/Requests/RequestService.cs), `RequestDto.cs`.
- עדכון במקום: [RequestsDbContext.cs](CandidateTest/src/Requests.Infrastructure/Persistence/RequestsDbContext.cs) (`OnModelCreating`), [RequestRepository.cs](CandidateTest/src/Requests.Infrastructure/Repositories/RequestRepository.cs) (`SearchAsync`), `DependencyInjection.cs` (החלטת ה-Provider).
- **`src/Requests.Api/Security/ClaimsCurrentUserAccessor.cs`** — מימוש `ICurrentUser` מעל `HttpContext.User` (נשאר זהה, ר' 6.ii).
- **`src/Requests.Api/Controllers/AuthController.cs`** — `POST api/auth/login` (אופציה B, סעיף 6.ii).
- **`src/Requests.Infrastructure/Identity/`** — `AppUser.cs`, `AuthService.cs`, `JwtTokenGenerator.cs` (פירוט מלא בתוכנית הבנייה למטה).
- עדכון במקום: [RequestsController.cs](CandidateTest/src/Requests.Api/Controllers/RequestsController.cs) (Query binding, הסרת parsing ידני, הוספת `[Authorize]`), `Program.cs` (CORS, Exception middleware, `AddAuthentication().AddJwtBearer(...)` + `UseAuthentication()`/`UseAuthorization()`).
- **פרויקט Frontend חדש** כתיקייה עליונה אחות — `C:\Users\me\Downloads\CandidateTest\frontend\` — לצד `src/` ו-`tests/` הקיימים, לא בתוך `src/`. שומר את עץ ה-Backend המבוסס-`.sln` נפרד מעץ ה-Frontend המבוסס-`package.json` — שורה אחת הסבר ב-README.
- **`tests/Requests.Tests/`** — לכתוב מחדש את שני הטסטים הקיימים לזרימת `SearchAsync` (החלפה מתועדת, ר' סעיף 2). אופציונלי: טסטי אינטגרציה עם `WebApplicationFactory` מול `Requests.Api` (היום הפרויקט לא אפילו מפנה ל-Api). 3-5 טסטים חדים (גבול הרשאות רגיל/אדמין, טווח תאריכים לא תקין → 400, התאמה חלקית, סינון multi-status, מצב ריק) עדיפים על סוויטה גדולה בעלת ערך נמוך.
- **שורש הריפו**: `README.md`, `AI-usage.md`, תרשים Architecture+Cloud (Mermaid בתוך Markdown, או PNG מיוצא מ-Excalidraw/draw.io — הכלי לבחירתך, המבחן מאפשר), `.gitignore` (לא קיים — `obj/`/`bin/` כבר בעץ), ו-`git init` מוקדם עם commits הדרגתיים (הריפו כלל לא תחת git כרגע).

---

## 4. זרימה בין רכיבים

### (א) זרימה סינכרונית — חיפוש (חלק א')

1. המשתמש כבר עבר Login (Username+Password מול `AppUser` ב-DB) וה-Token נשמר ב-`sessionStorage`. משנה פילטר/מיון/עמוד ב-Frontend; ה-API client בונה query string (`?requestNumber=...&status=New&status=InProgress&requestType=Legal&createdFrom=...&createdTo=...&sortBy=createdAt&sortDirection=desc&page=2&pageSize=25`) וקורא ל-`GET /api/requests` עם `Authorization: Bearer <token>` שצורף ע"י ה-`authInterceptor`.
2. ה-UI עובר ל-**loading**; בקשה קודמת שעדיין באוויר מבוטלת (AbortController/RxJS `switchMap`).
3. Model binding ממפה את ה-query string; `[ApiController]` מפיק אוטומטית 400/ProblemDetails על כשל binding בסיסי (enum/date שגויים).
4. עוד לפני שה-Action רץ, JWT Bearer Middleware כבר אימת את ה-Token (חתימה, Issuer, Audience, תוקף) ואכלס את `HttpContext.User` ב-`ClaimsPrincipal`; `[Authorize]` על ה-Controller חוסם קריאות בלי Token תקין/לא-פג (401). בתוך ה-Action, ה-Controller פותר `ICurrentUser` (מ-DI, מיושם ע"י `ClaimsCurrentUserAccessor` מעל `HttpContext.User`) וקורא ל-`_service.SearchAsync(query, ct)`.
5. `RequestService` מריץ Validation סמנטי (סדר תאריכים, גבולות page/pageSize, sort key לא מוכר → ברירת מחדל); כשל → שגיאות ברמת שדה → 400 + ProblemDetails.
6. קלט תקין → `IRequestRepository.SearchAsync(query, currentUser, ct)`.
7. ה-Repository מרכיב את ה-`IQueryable`: תנאי הרשאות ראשון ותמיד, אח"כ פילטרים שסופקו בפועל, `CountAsync`, מיון+עימוד+projection, `ToListAsync`. רק שורות העמוד הנוכחי חוצות את גבול DB→אפליקציה — צמצום ההרשאות קורה **בתוך** השאילתה.
8. Service ממפה ל-`PagedResult<RequestDto>`; Controller מחזיר `200 OK`.
9. Frontend יוצא מ-loading; `items.length == 0` → מצב ריק מפורש; אחרת — שורות + עימוד מעודכן מ-`totalCount`. כל כשל רשת/סטטוס לא-2xx → מצב שגיאה מפורש, אף פעם לא מסך ריק שקט.
10. Logout והתחברות מחדש כמשתמש אחר (Admin מול Regular, שני המשתמשים כבר קיימים ב-Seed) מריצה את אותה זרימה עם Token שונה ומחזירה סט תוצאות שונה — **זו ההוכחה** שהאכיפה היא server-side (כי הצמצום קורה בשלב 7, בתוך שאילתת ה-DB), לא רק "משתמש שונה נבחר במסך".

### (ב) זרימה אסינכרונית — Notification אמין (תרחיש חלק ב')

זהו הלב של חלק ב' — כדאי להציג כרצף שמות-דפוסים, לא רק תיבות בתרשים:

1. **טריגר** — אירוע עסקי מפורש (`RequestCreated`, `RequestStatusChanged{RequestId, OldStatus, NewStatus, OwnerId, AssignedToUserId, OccurredAtUtc}`) ברגע ש-Requests מבצע commit ליצירה/שינוי סטטוס.
2. **למה לא לקרוא ל-Notifications ישירות (HTTP, אותה בקשה)** — קריאה סינכרונית ישירה אומרת: (א) אם Notifications למטה — או שכתיבת ה-Request נכשלת, או שההתראה נעלמת בשקט; (ב) גם כשזמין — זמינות נתיב הכתיבה של Requests נהיית תלויה בזמינות Notifications — ריח של "distributed monolith" במערכת שהמבחן מבקש לפרק ל-Microservices.
3. **Transactional Outbox** — כש-Requests מבצע commit לשינוי, הוא כותב את האירוע לטבלת outbox **באותה טרנזקציה** בדיוק כמו שינוי השורה העסקית. מבטיח שהאירוע נרשם אם-ורק-אם השינוי העסקי בוצע — בלי בעיית dual-write.
4. **Relay** — מפרסם נפרד (worker שסוקר, או CDC כמו Debezium שקורא את transaction log) קורא שורות outbox שלא פורסמו ומפרסם אותן ל-message broker, ואז מסמן כ"נשלח".
5. **Broker: at-least-once, durable** — הודעות נשמרות ב-broker גם כש-Notifications למטה; הן פשוט מצטברות בתור ומתנקזות כשהוא חוזר (גם מקבלים load-leveling "בחינם").
6. **אידמפוטנטיות בצד הצרכן (Inbox pattern)** — at-least-once אומר ש-Notifications עלול לראות אותו אירוע פעמיים; עוקב אחרי IDs שכבר טופלו בטבלת "inbox" קטנה משלו ומתעלם מכפילויות.
7. **Retry עם backoff + DLQ** — כשלים זמניים בצד הצרכן (למשל ספק Email/SMS זמנית למטה) מקבלים retry עם exponential backoff חסום; אחרי N כשלים ההודעה עוברת ל-Dead-Letter Queue כדי שהודעה "מורעלת" לא תחסום את שאר התור.
8. **מה Requests רואה** — כלום. מעבר לכתיבת ה-outbox, Requests מנותק לחלוטין מהזמינות/latency של Notifications. המשפט הכי שווה לומר בראיון המשך.
9. **לקרוא לערבות בשם המפורש** — זה נותן **at-least-once, eventually-consistent**, לא exactly-once/סינכרוני. להציג את זה כ-Tradeoff מודע ומתאים (התראות הן דוגמה קלאסית ל-eventual consistency).
10. **חיבור לניטור** — עומק תור / כמות DLQ / גיל ההודעה הישנה בתור ה-Notifications הוא התשובה הישירה ל"מערכת ה-Notification עלולה להיות זמנית לא זמינה" (מתחבר לסעיף Monitoring בחלק ג').

**איך Reporting/Documents/Customers מתחברים לאותו backbone** (ברמת-על בכוונה, כי המבחן מבקש עומק רק על תרחיש ה-Notification):
- אותם אירועי `RequestCreated`/`RequestStatusChanged` מופצים (topic אחד, תור עצמאי לכל צרכן) לכל שירות מעוניין בלי ש-Requests ידע מי מאזין.
- **Reporting** נרשם כדי לבנות read model דנורמלי משלו (בסגנון CQRS) — מוריד עומס אנליטי כבד מה-DB הטרנזקציוני של Requests.
- **Documents** יפרסם אירועים משלו (`DocumentUploaded`) לאותו backbone.
- **Customers** — Requests יקרא לו סינכרונית read-only לפי צורך, או ישמור עותק מקומי מצומצם של שדות תצוגה דרך אירוע `CustomerUpdated` — **מסומן במכוון כלא-פתור**, תלוי בנפח קריאה אמיתי; המבחן לא מבקש עומק על Customers.
- כל שירות שומר **DB משלו** (database-per-service); ה-backbone האסינכרוני הוא משטח האינטגרציה העיקרי, עם API סינכרוני צר רק היכן ש-eventual consistency באמת לא מקובל.

---

## 5. המלצת שירותי AWS (חלק ג')

**Compute:**
- **Requests API** → **ECS Fargate**: Containerized, "חם" תמיד (בלי cold start ל-API מול משתמשים), autoscaling פשוט, בלי overhead תפעולי של Kubernetes. EKS = החלופה "חזקה יותר, ops יקר יותר" — הגיוני רק אם הארגון כבר סטנדרטי עליו.
- **Outbox relay + Notification consumer** → **Lambda**, מופעל ע"י SQS: טבעי ל-event-driven/גלי עומס, יורד לאפס כשאין עומס, AWS מנהל polling/retry/visibility-timeout.
- Tradeoff מפורש: Fargate = latency צפוי, מתאים לעומס קבוע, בלי cold start, אבל משלמים על קיבולת גם ב-idle; Lambda = pay-per-use וסקיילינג אוטומטי, מעולה לעבודת רקע גלית, אבל cold start ומגבלת 15 דקות ריצה. Lambda ל-API עצמו (API Gateway+Lambda) אפשרי אך פחות ברירת המחדל ה"סניורית" ל-API CRUD סטייטפולי עם connection pooling של EF Core — יידרש RDS Proxy. זו הסיבה ש-Fargate מומלץ ל-API.
- **Frontend** → S3 + CloudFront (ברירת מחדל כמעט לא-שנויה במחלוקת ל-SPA).

**Database:**
- דפוס הגישה של Requests — סינון רב-עמודות אד-הוק, טווחי תאריכים, multi-value status — מהותית רלציוני, מה שמעדיף **RDS/Aurora (Postgres)** על פני DynamoDB (ש-shines בדפוסי גישה ידועים וצרים; שילובי פילטר שרירותיים ידרשו הרבה GSIs ועדיין לא יכסו חיפוש חלקי בטקסט בצורה נקייה).
- **RDS Postgres מול Aurora Postgres**: RDS = פשוט וזול יותר, מספיק בהיקף קטן-בינוני; Aurora = read-scaling טוב יותר (replicas), failover מהיר יותר, storage auto-scaling — השדרוג הנכון כשעומס הקריאה האמיתי מגיע. **מומלץ: RDS Postgres** כנקודת פתיחה פרגמטית, Aurora כ"נתיב הגדילה" המפורש. (הבהרה: זו המלצת Production בענן בלבד — לצורך התרגיל המקומי עצמו הוחלט להישאר על EF Core InMemory, ר' סעיף 6.i. הפער בין השניים הוא עצמו נקודה תקפה לתעד ב-README: מה שרץ מקומית ומה שהיה רץ בפרודקשן, ולמה.)
- כל שירות עתידי מקבל **DB משלו**, לא בהכרח אותו מנוע: ה-inbox/delivery-log של Notifications הוא טבלת lookup-by-ID קטנה — מתאים ל-RDS קטן או אפילו DynamoDB; Reporting מועמד ל-read replicas/materialized views של Postgres, Redshift בהיקף אנליטי גדול באמת, או OpenSearch אם הצורך נוטה לטקסט-חופשי/אגרגציות — **מסומן כ"להחליט כשצורת השאילתות של Reporting תהיה ידועה"**.
- **Documents** → metadata בטבלה רלציונית/DynamoDB קטנה, בייטים של קבצים ב-**S3** (אף פעם לא ב-DB הרלציוני).

**Messaging (המיפוי הישיר של סיפור האמינות מחלק ב' ל-AWS):**
- **SNS topic (`request-events`) עם fan-out ל-SQS queues לכל צרכן** (Notifications מקבל תור משלו, Reporting מקבל תור משלו) — fan-out קלאסי, כל צרכן עצמאי ובר-קיימא עם מדיניות redrive/DLQ משלו, כך שצרכן Notifications איטי/למטה לא משפיע על תור Reporting. ה-visibility timeout + redrive-to-DLQ של SQS ממש מיישמים את "retry עם backoff ואז dead-letter" מחלק ב'.
- **EventBridge** כחלופה: מוסיף ניתוב מבוסס-תוכן וסכימה רשומה, במחיר של מודל מנטלי פחות פשוט לתכנון ראשוני. עבור סוג-או-שניים של אירועים וצרכנים ידועים — SNS+SQS פשוט ומספיק; EventBridge מרוויח את המורכבות שלו כשקטלוג האירועים גדל וניתוב-לפי-תוכן חשוב יותר מ"כל המתעניינים מקבלים הכל". **מומלץ: SNS+SQS** כברירת מחדל להיקף הנוכחי.
- **Amazon MQ / MSK** — שווה לציין רק כדי להסביר למה לא: MQ מתאים אם כבר יש מומחיות RabbitMQ בצוות; MSK מרוויח את המורכבות שלו עם צורך replay/retention ארוך שהתרחיש הזה לא דורש.
- טבלת ה-outbox עצמה יושבת בתוך ה-RDS/Aurora של Requests עצמו — לא שירות AWS נפרד.

**Monitoring:**
- **CloudWatch** (Logs/Metrics/Alarms) כבסיס; alarms על p95/p99 latency ו-5xx rate של ה-API, CPU/connections של ה-DB, והתשובה הישירה ל"Notification עלול להיות זמנית לא זמין" — **עומק תור וכמות/גיל הודעות ב-DLQ** של תור Notifications.
- **X-Ray** (או OpenTelemetry) למעקב חוצה-שירותים על הקפיצה האסינכרונית (Requests → SNS → SQS → Notifications), כך שהתראה שנכשלת מתחקרת חזרה לבקשה המקורית.
- **RDS/Aurora Performance Insights** לנראות שאילתות בצד ה-DB — מאמת בפועל את אסטרטגיית האינדקסים מחלק א' תחת עומס.

**Scaling:**
- API (Fargate): target-tracking על CPU/memory או request-count-per-target מאחורי ALB.
- Lambda consumers: מתרחב אוטומטית עם עומק ה-SQS; מוגבל ב-reserved/maximum concurrency כדי לא להציף את ספק ההתראות.
- DB: read replicas/Aurora Replicas כשעומס קריאה בסגנון Reporting מתממש; RDS Proxy אם יש נתיב מבוסס-Lambda.
- Frontend: CloudFront הופך את זה כמעט לבעיה פתורה.
- הערה מפורשת: סקיילינג של Compute לא מתקן שאילתה גרועה — עיצוב האינדקסים/Projection/עימוד מחלק א' הוא מה שבאמת עונה על "מיליוני רשומות"; AWS scaling מטפל במשתמשים מקבילים, לא בשאילתה בודדת לא-ממוינת.

(שורה אחת על טופולוגיית רשת, בלי להרחיב כי חלק ג' מחריג IaC במפורש: Fargate tasks ו-RDS ברשתות פרטיות, ALB ברשת ציבורית, credentials ב-Secrets Manager.)

---

## 6. החלטות פתוחות / Tradeoffs לבחירתך

**(i) ספק EF Core — ✅ הוחלט (עודכן): נשארים על InMemory הקיים, אך נכתב קוד יעיל כאילו מדובר ב-DB רלציוני אמיתי עם מיליוני רשומות**
- *מעבר בפועל ל-SQLite/DB אחר* — היה מאפשר להוכיח שימוש אמיתי באינדקסים (`EXPLAIN QUERY PLAN`), אבל דורש זמן הקמה (Migration, חיבור) שהוחלט שלא משתלם מול תקציב 3 השעות.
- ✅ *נשארים על InMemory הקיים (נבחר, החלטה מעודכנת)* — בלי Migration, בלי שינוי Package, הקמה מיידית. **אבל**: קוד ה-`RequestRepository.SearchAsync` עצמו נכתב **בדיוק** באותה רמת משמעת שהיה נכתב מול DB רלציוני אמיתי — דחיפת הרשאות+סינון+מיון+עימוד ל-`IQueryable`, `AsNoTracking`, `Select` Projection ישיר במקום טעינת Entities מלאים, ו-`OnModelCreating` עם `HasIndex` מלא (ר' סעיף 2). ה**קוד** יעיל; ה-**Provider** בפועל פשוט לא יודע לנצל את זה.
- **נימוק לתיעוד ב-README** (לכתוב מפורש, לא בשקט): "נבחר להישאר על EF Core InMemory מטעמי זמן. קוד השאילתה נכתב כך שיהיה יעיל על DB רלציוני אמיתי עם מיליוני רשומות — כולל הגדרת אינדקסים ב-`OnModelCreating` — אך ה-Provider הנוכחי אינו מנצל אותם בפועל ואינו מאפשר הוכחת Query Plan. בחלק ג' ההמלצה לענן (RDS/Aurora Postgres) היא מה שהייתי מיישם בפרודקשן — זו החלטת Scope מודעת: להפריד בין 'מה שרץ מקומית בתרגיל' לבין 'מה שהייתי ממליץ בפרודקשן', ר' גם סעיף 5."
- **איך בכל זאת מוכיחים 'יעילות' בלי DB אמיתי**: דרך קריאת קוד, לא דרך מדידה. אפשר להראות בבירור בכל שלב של `SearchAsync` שאף פעם לא נטען יותר משורות-העמוד-הנוכחי לזיכרון (`Skip/Take` לפני `ToListAsync`), שתנאי ההרשאות תמיד ראשון ולא-מותנה, ושאין אף `Where` שרץ על `List` שכבר נטען במלואו — זה בדיוק ההפך מהבאג שזיהינו בקוד הקיים (`GetAllAsync` + LINQ-to-Objects, ר' "מה כבר קיים ברפו" למעלה).

**(ii) הרשאות — ✅ הוחלט (עודכן פעם נוספת): אופציה B — JWT אמיתי מלא, Login מול DB**
- *הרחבת ה-header stub הפשוטה מאחורי `ICurrentUser` בלבד (A)* — הכי מהיר, פחות מדגים Pipeline סטנדרטי.
- *Pipeline אמיתי של ASP.NET Core, זהות מדומה (C)* — נבחרה בהתחלה, אך הוחלפה לאחר דיון חוזר.
- ✅ *JWT/Identity אמיתיים מלאים (B, נבחר סופית)* — מסך Login אמיתי (Username+Password), אימות מול `AppUser` אמיתי ב-DB (Seed: משתמש אחד ברמת Administrator, השאר Regular), הנפקת JWT חתום, `AddJwtBearer` בפועל ב-Api. **החלטה מודעת**: לא כי זה נדרש מילולית בנוסח המבחן, אלא בחירה מפורשת להשקיע כאן ולהדגים יכולת Full-Stack Auth אמיתית — הועלה במפורש שזו עלות זמן/מורכבות נוספת מעבר ל-A/C, ונבחר ביודעין.

**החלטות משנה שנקבעו יחד עם הבחירה ב-B**:
- **`AppUser` מול `Request.OwnerId`**: **בלי** FK אמיתי — נשארים עקביים עם החלטה 6.iv (Database-per-Service). ההתאמה המספרית בין `AppUser.Id` ל-`OwnerId`/`AssignedToUserId` היא מוסכמת-Seed בלבד, לא אילוץ שה-DB אוכף — FK אמיתי היה יוצר תלות שצריך להסיר במפורש ביום שה-Users הופך לשירות נפרד.
- **Routing ב-Frontend**: Angular Router **אמיתי** (`/login`, `/search`) — לא תצוגה מותנית פשוטה.
- **חווית הדגמה**: **בלי** כפתורי-קיצור ל"התחברות מהירה" — כל החלפת משתמש בהדגמה היא הקלדה אמיתית של קרדנציאלס.
- **אחסון Token**: `sessionStorage`.
- **פקיעת Token**: טיפול יפה בצד לקוח (הודעה ברורה + חזרה ל-Login) כשה-API מחזיר 401 — **בלי** Refresh Token או מנגנון חידוש מורכב, במפורש.

**השלכה על הארכיטקטורה**: הממשק `ICurrentUser` ב-Application **עדיין לא משתנה**, וגם `ClaimsCurrentUserAccessor` ב-Api **נשאר אותו קובץ בדיוק** — כי JWT Bearer Middleware מאכלס את `HttpContext.User` באותה צורה בדיוק שה-`AuthenticationHandler` המותאם אישית היה עושה. רק מקור האימות משתנה (JWT Bearer סטנדרטי במקום Handler מותאם אישית) — לא איך קוראים את התוצאה שלו. ר' פירוט מלא בסעיפים 2 ו-3.

**(iii) עימוד — ✅ הוחלט: מתווסף (אושר בדיון)**
הטקסט המילולי בחלק א' לא כותב "עימוד", אבל "יש להניח מיליוני רשומות" הופך endpoint לא-מעומד ללא-הגנתי בכל מימוש (`Page`/`PageSize` כבר חלק מ-`RequestSearchQuery` בסעיף 2). **לתעד במפורש** ב-README/AI-usage.md: "עימוד לא נדרש במפורש, אך הוא תוצאה בלתי נמנעת של אילוץ הביצועים שצוין" — הופך הנחה שקטה לניתוח דרישות מודגם.

**(iv) Entities ל-User/Customer — ✅ הוחלט: נשאר `int` גולמי, בלי שום שכבת תצוגה נוספת**
`OwnerId`/`AssignedToUserId`/`CustomerId` נשארים `int` בדיוק כמו היום — גם ב-Backend וגם ב-Frontend (בלי מילון Lookup להצגת שמות בצד לקוח). בדיקת ההרשאות צריכה רק שוויון ID, לא Entity מקושר. **נימוק לתיעוד ב-README** (החלטת scope מפורשת, לא שתיקה): בעולם ה-Microservices מחלק ב', ל-Requests ממילא לא אמור להיות FK קשיח לתוך DB עתידי של Customers/Users — כך שהצורה הנוכחית כבר "נכונה" לכיוון הארכיטקטוני העתידי, לא רק פשרת זמן. בטבלת התוצאות ב-Frontend, העמודות המתאימות פשוט יציגו מספר (למשל `Owner: 3`) ולא שם.

### תזמון מוצע (בתוך 3 שעות)
Part A Backend ~70-80 דק' | Part A Frontend ~50-60 דק' | Part B (מסמך תכנון) ~25-30 דק' | Part C (סקיצה) ~15-20 דק' | README+AI-usage.md ~15-20 דק'. חלק C ו-README נשארים "לא-משא-ומתן" ולא "מה שנשאר" — חלק C לא-גמור-אך-מתועד מקובל לפי כללי המבחן עצמו; README/AI-usage.md חסרים — לא.

---

## תוכנית בנייה מפורטת — Part A בלבד (DB → Backend → Frontend)

**הערות מסגרת**:
- **היקף**: חלק א' בלבד (Feature: חיפוש/סינון, Backend+Frontend). חלק ב' וחלק ג' נשארים תרשים/מסמך לפי נוסח המבחן עצמו — אין כאן קבצי קוד בשבילם.
- **הפרדה**: שלושה מדורים נפרדים לגמרי — DB, Backend, Frontend, באותו סדר — כי זה גם סדר התלות בפועל (Backend תלוי שה-DB מוגדר; Frontend תלוי שה-API קיים). בגלל שאני עדיין בתוך Plan Mode ומותר לי לערוך רק את קובץ התוכנית הזה, שלושת המדורים בנויים כאן כסעיפים נפרדים לגמרי (לא מעורבבים) בתוך אותו קובץ — ברגע שנצא לשלב הבנייה בפועל, אני יכול לפצל את זה לשלושה קבצים פיזיים נפרדים בפרויקט אם עדיין תרצי.
- **רמת פירוט**: לכל קובץ — נתיב מדויק, אחריות, וחתימות (שם Type/Function + פרמטרים + Return Type). בלי גוף מימוש בפועל — זה עדיין לא קוד, אבל בלי שום "יהיה בסדר" מעורפל.
- כל הפירוט כאן נשען על ההחלטות שכבר ננעלו בסעיף 6 למעלה: SQLite, Auth אופציה C, עימוד כן, בלי Entities ל-User/Customer, Angular+Material.

### מדור 1: DB

**קונפיגורציה** — לא נדרש Connection String חדש (InMemory לא צריך אחד). שם ה-DB הקיים (`"CandidateRequests"`) יכול להישאר Hardcoded בדיוק כמו היום.

**Schema** — קובץ קיים, `src/Requests.Domain/Entities/Request.cs`: ללא שינוי מבני, אין שדות חדשים.

**אינדקסים (בקוד — כוונה מתועדת, לא אכיפה בפועל)** — קובץ קיים, עדכון: `src/Requests.Infrastructure/Persistence/RequestsDbContext.cs`. מוסיפים בכל זאת override ל-`OnModelCreating(ModelBuilder modelBuilder)` שמגדיר `HasIndex` על: `RequestNumber`; זוג מורכב `(OwnerId, CreatedAt)`; זוג מורכב `(AssignedToUserId, CreatedAt)`; ועמודות בודדות `Status`, `RequestType`, `CreatedAt`. **הבהרה חשובה**: EF Core InMemory מקבל את הקונפיגורציה הזו בלי שגיאה, אבל מתעלם ממנה לגמרי בזמן ביצוע שאילתה — זה תיעוד כוונה ארכיטקטונית, לא אופטימיזציה שבאמת קורית כאן (ר' סעיף 6.i).

**Migration** — **לא נדרש**. InMemory לא תומך ולא צריך EF Migrations.

**Seed — Requests** — קובץ קיים, `src/Requests.Infrastructure/Persistence/DbSeeder.cs`: ללא שינוי, נשאר על 500 שורות. **לגבי "מיליוני רשומות" בהדגמה בפועל**: גם עם ההחלטה להישאר על InMemory, לא ריאלי ולא נדרש לטעון בפועל מיליוני שורות לתוך תהליך חי בזמן הדגמה (זה רק יאט כל הרצה בלי שום תועלת אמיתית, כי אין Query Planner שינצל את זה ממילא) — ה"התייחסות כאילו קיימות מיליונים" מתבטאת ב**צורת הקוד עצמו** (ר' סעיף 2 וסעיף 6.i), לא בכמות השורות שבפועל נטענות בהדגמה.

**Seed — AppUser (חדש, בעקבות 6.ii — אופציה B)** — קובץ חדש, `src/Requests.Infrastructure/Identity/UserSeeder.cs` (מדפוס זהה ל-`DbSeeder.cs`, נקרא לצדו מ-`Program.cs`). **מנגנון**: רשימה מפורשת וקבועה בקוד (לא לוגיקה/אלגוריתם) — הרשומה הראשונה `IsAdministrator = true`, כל השאר `false`:

| Id | Username | IsAdministrator |
|---|---|---|
| 1 | admin | true |
| 2 | alice | false |
| 3 | bob | false |
| 4 | carol | false |
| 5 | dave | false |

**למה דווקא Id 1–5**: `DbSeeder` הקיים מחזר `AssignedToUserId` בדיוק על טווח 1–5, בעוד `OwnerId` מחזר על 1–100 (וכולל את 1–5). משתמש שה-Id שלו בטווח 1–5 יראה בהתחברות בפועל גם בקשות בבעלותו וגם בקשות שהוקצו אליו (~100 בממוצע) — הדגמה עשירה שמראה גם עימוד. Admin לא חייב פונקציונלית להיות בטווח הזה (רואה הכל בלי קשר ל-Ownership שלו), אבל נשמר שם לשם סדר. ה-`Id` נקבע **ידנית** בקוד לכל משתמש (לא Auto-Generation של EF) כדי להבטיח בוודאות שהוא בטווח הנכון. Guard זהה לזה של `DbSeeder`: `if (db.Users.Any()) return;`. **זו התאמה לוגית-בזמן-Seed בלבד בין `AppUser.Id` ל-`OwnerId`/`AssignedToUserId`, לא FK אמיתי** (ר' 6.ii). סיסמאות: קבועות וידועות מראש (מתועדות ב-README, לא בקוד-מקור כטקסט גלוי — נשמרות רק כ-Hash דרך `PasswordHasher`).

### מדור 2: Backend (.NET) — בסדר בנייה, שכבה אחרי שכבה

**Domain — ללא שינוי**: אין קבצים חדשים, אין עדכונים ל-`Request.cs`/`RequestStatus.cs`/`RequestType.cs`.

#### Application (נבנה ראשון — הכל תלוי בזה)

- קובץ חדש, `src/Requests.Application/Common/ICurrentUser.cs` — ממשק עם `int UserId { get; }` ו-`bool IsAdministrator { get; }`.
- קובץ חדש, `src/Requests.Application/Common/PagedResult.cs` — `sealed record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize)`.
- קובץ חדש, `src/Requests.Application/Common/ValidationException.cs` — `sealed class ValidationException : Exception`, עם `IReadOnlyDictionary<string, string[]> Errors { get; }` וקונסטרוקטור שמקבל אותו.
- קובץ חדש, `src/Requests.Application/Requests/Search/RequestSearchQuery.cs` — `sealed record RequestSearchQuery` עם: `string? RequestNumber`, `IReadOnlyList<RequestStatus>? Statuses`, `RequestType? RequestType`, `DateTime? CreatedFrom`, `DateTime? CreatedTo`, `string? SortBy`, `string? SortDirection`, `int Page = 1`, `int PageSize = 25` (כולם `init`).
- קובץ חדש, `src/Requests.Application/Requests/Search/RequestSearchQueryValidator.cs` — `static class` עם `static void Validate(RequestSearchQuery query)` שזורק `ValidationException`. כללים לממש: `RequestNumber` עד 50 תווים; `CreatedFrom <= CreatedTo` כששניהם קיימים; `Page >= 1`; `PageSize` בין 1 ל-100; `SortBy` מחוץ לרשימה סגורה **לא** נכשל — נופל לברירת מחדל בשקט ב-Infrastructure, לא Validation Error.
- קובץ קיים, עדכון מלא — `src/Requests.Application/Requests/IRequestRepository.cs`: מוחקים `GetAllAsync` לגמרי, מחליפים ב-`Task<PagedResult<RequestDto>> SearchAsync(RequestSearchQuery query, ICurrentUser currentUser, CancellationToken cancellationToken = default)`. **החלטת שכבות מכוונת**: ה-Repository מחזיר `RequestDto` ישירות ולא `Request` — כי זו שאילתת-קריאה (Query, לא Command) וה-Projection ל-DTO קורית כבר ברמת ה-SQL ב-Infrastructure, כך שנמנעים ממיפוי כפול.
- קובץ קיים, עדכון — `src/Requests.Application/Requests/IRequestService.cs`: `Task<PagedResult<RequestDto>> SearchAsync(RequestSearchQuery query, CancellationToken cancellationToken = default)`.
- קובץ קיים, עדכון מלא — `src/Requests.Application/Requests/RequestService.cs`: Constructor מקבל `IRequestRepository repository, ICurrentUser currentUser` (לא רק repository כמו היום). `SearchAsync` קורא קודם ל-`RequestSearchQueryValidator.Validate(query)`, ואז ל-`_repository.SearchAsync(query, _currentUser, cancellationToken)`.
- קובץ קיים, ללא שינוי מבני — `RequestDto.cs`.

**Auth (חדש, בעקבות 6.ii — אופציה B)** — תיקייה חדשה, `src/Requests.Application/Auth/`:
- `LoginRequest.cs` — `sealed record LoginRequest(string Username, string Password)`.
- `LoginResult.cs` — `sealed record LoginResult(string Token, DateTime ExpiresAtUtc)`.
- `IAuthService.cs` — `Task<LoginResult?> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)` (`null` = קרדנציאלס שגויים). **חשוב**: שני ה-Records לעיל מבוססי-Primitives בלבד — Application לא מכיר בכלל את `AppUser` (שיושב ב-Infrastructure, ר' שם), בדיוק כמו ש-`IRequestRepository` לא מדליף EF Types החוצה.
- `IJwtTokenGenerator.cs` — Port נוסף: `string GenerateToken(int userId, bool isAdministrator)`. המימוש (ב-Infrastructure) הוא זה שיודע איך "לייצר קרדנציאל חתום" — בדיוק כמו ש-Hashing סיסמה הוא פרט מימוש, לא משהו ש-Application צריך לדעת עליו.

#### Infrastructure (נבנה שני — מממש את מה ש-Application הגדיר)

- קובץ קיים, עדכון — `RequestsDbContext.cs`: הוספת `OnModelCreating` (ר' מדור DB).
- קובץ חדש, `src/Requests.Infrastructure/Repositories/RequestSortExpressions.cs` — `static class` עם `static IOrderedQueryable<Request> Apply(IQueryable<Request> source, string? sortBy, string? sortDirection)`. מיפוי סטטי מ-`sortBy` לביטוי טיפוסי; ברירת מחדל `CreatedAt desc` על כל קלט לא-מזוהה.
- קובץ קיים, עדכון מלא — `src/Requests.Infrastructure/Repositories/RequestRepository.cs`: מוחקים `GetAllAsync`, מוסיפים `SearchAsync` (חתימה זהה לזו שב-`IRequestRepository`). סדר הרכבה בפנים: `AsNoTracking()` → תנאי הרשאות (Owner/Assignee, מדולג ל-Admin) → תנאים מותנים לכל שדה שסופק בפועל → `CountAsync` → `RequestSortExpressions.Apply(...)` → `Skip/Take` → `.Select(...)` ישירות ל-`RequestDto` → `ToListAsync` → עטיפה ב-`PagedResult<RequestDto>`.
- קובץ קיים, **ללא שינוי מהותי** — `DependencyInjection.cs`: נשאר `UseInMemoryDatabase("CandidateRequests")` בדיוק כמו היום — **אין** מעבר ל-`UseSqlite`. אפשר (לא הכרחי) להעביר את שם ה-DB לפרמטר בחתימת `AddInfrastructure` לשם ניקיון, בלי לשנות את ה-Provider עצמו.
- קובץ קיים, ללא שינוי — `DbSeeder.cs`.

**Identity (חדש, בעקבות 6.ii — אופציה B)** — תיקייה חדשה, `src/Requests.Infrastructure/Identity/`:
- `AppUser.cs` — מחלקה רגילה (**לא** Domain Entity, במכוון — ר' 6.ii): `Id`, `Username`, `PasswordHash`, `IsAdministrator`.
- `AuthService.cs` — מממש `IAuthService`. משתמש ב-`RequestsDbContext.Users`, `PasswordHasher<AppUser>` המובנה של ASP.NET Core לאימות סיסמה, וב-`IJwtTokenGenerator` להנפקת Token בהצלחה.
- `JwtTokenGenerator.cs` — מממש `IJwtTokenGenerator`. קורא `Jwt:Key`/`Jwt:Issuer`/`Jwt:Audience`/`Jwt:ExpiryMinutes` מ-`IConfiguration`, בונה Claims (`ClaimTypes.NameIdentifier` + Role `Administrator` אם רלוונטי — **אותם Claim Types בדיוק** ש-`ClaimsCurrentUserAccessor` כבר יודע לקרוא), חותם עם `JwtSecurityTokenHandler`.
- `UserSeeder.cs` — ר' מדור DB למעלה.

עדכון קובץ קיים — `RequestsDbContext.cs`: מוסיפים `DbSet<AppUser> Users => Set<AppUser>();` לצד `DbSet<Request>` הקיים (**אותו** Context, לא Context שני).

- פרויקט, עדכון — `Requests.Infrastructure.csproj`: נשארים על `Microsoft.EntityFrameworkCore.InMemory` הקיים (**אין** `Sqlite`/`Design`, ר' 6.i) — מוסיפים `System.IdentityModel.Tokens.Jwt` (הנפקת Token) ו-`Microsoft.AspNetCore.Identity` (עבור `PasswordHasher`).

#### Api (נבנה שלישי — חושף את מה ש-Application/Infrastructure מספקים)

- קובץ חדש, `src/Requests.Api/Security/ClaimsCurrentUserAccessor.cs` — `sealed class ClaimsCurrentUserAccessor : ICurrentUser`, קונסטרוקטור מקבל `IHttpContextAccessor`. `UserId` נגזר מ-`User.FindFirstValue(ClaimTypes.NameIdentifier)`, `IsAdministrator` מ-`User.IsInRole("Administrator")`.
- קובץ חדש, `src/Requests.Api/Controllers/AuthController.cs` — (אופציה B, 6.ii) `[HttpPost("api/auth/login")] Task<ActionResult<LoginResult>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)`. קורא ל-`IAuthService.LoginAsync`; `null` → `Unauthorized()`, אחרת `Ok(loginResult)`. **בלי** `[Authorize]` (זו נקודת הכניסה שמעניקה Token מלכתחילה).
- קובץ חדש, `src/Requests.Api/ExceptionHandling/ValidationExceptionHandler.cs` — `sealed class ValidationExceptionHandler : IExceptionHandler` עם `ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)`. תופס `ValidationException` מ-Application, מחזיר 400 + `ValidationProblemDetails`; חריגות אחרות מחזיר `false` (עובר הלאה ל-Handler/Middleware כללי).
- קובץ קיים, עדכון מלא — `Controllers/RequestsController.cs`: מוסיפים `[Authorize]` ברמת המחלקה, מוחקים `ParseUserId` והקריאה הידנית ל-`Request.Headers` לגמרי. Action יחיד: `[HttpGet] Task<ActionResult<PagedResult<RequestDto>>> Search([FromQuery] RequestSearchQuery query, CancellationToken cancellationToken)`.
- קובץ קיים, עדכון מלא — `Program.cs`, לפי הסדר: `AddHttpContextAccessor()` → `AddScoped<ICurrentUser, ClaimsCurrentUserAccessor>()` → `AddScoped<IAuthService, AuthService>()` + `AddScoped<IJwtTokenGenerator, JwtTokenGenerator>()` → `AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options => options.TokenValidationParameters = ...)` (מפתח/Issuer/Audience/Lifetime מ-`Jwt:*`) → `AddAuthorization()` → `AddExceptionHandler<ValidationExceptionHandler>()` + `AddProblemDetails()` → `AddCors(...)` (מדיניות בשם `"Frontend"`, Origins מ-`appsettings`) → `AddInfrastructure(builder.Configuration)`. ב-Pipeline (אחרי `Build()`): `UseExceptionHandler()` → `UseCors("Frontend")` → `UseAuthentication()` → `UseAuthorization()` → Swagger (כמו היום) → `MapControllers()`.
- פרויקט, עדכון — `Requests.Api.csproj`: הוספת `Microsoft.AspNetCore.Authentication.JwtBearer` (8.0.19, תואם לשאר).
- קובץ חדש, `appsettings.json`/`appsettings.Development.json`: אין צורך ב-Connection String (InMemory) — `"Cors": { "AllowedOrigins": ["http://localhost:4200"] }`, ובנוסף מדור `"Jwt": { "Key": "...", "Issuer": "RequestsApi", "Audience": "RequestsFrontend", "ExpiryMinutes": 60 }` (אופציה B, 6.ii).

#### Tests (נבנה רביעי — אחרי שהכל קיים לבדוק נגדו)

- קובץ חדש, `tests/Requests.Tests/TestCurrentUser.cs` — מימוש טריוויאלי של `ICurrentUser`, `UserId`/`IsAdministrator` ניתנים ל-Set בקונסטרוקטור.
- קובץ קיים, עדכון מלא — `RequestServiceTests.cs`: מוחקים את שני ה-`[Fact]` הקיימים (מבוססי `GetAllAsync`), מחליפים בטסטים מול Fake פשוט ל-`IRequestRepository` (בודקים Orchestration/Validation בלבד, לא DB אמיתי): `SearchAsync_WithInvalidDateRange_ThrowsValidationException`, `SearchAsync_WithPageBelowOne_ThrowsValidationException`, `SearchAsync_DelegatesToRepositoryWithCurrentUser`.
- קובץ חדש, `tests/Requests.Tests/RequestRepositoryTests.cs` — טסטים כנגד `RequestRepository` אמיתי, מול EF Core **InMemory** (שם DB ייחודי לכל טסט — למשל `Guid.NewGuid().ToString()` — כדי שטסטים לא ידלפו נתונים אחד לשני), עם כמה שורות Seed קבועות: `SearchAsync_RegularUser_OnlySeesOwnedOrAssignedRequests`, `SearchAsync_Administrator_SeesAllRequests`, `SearchAsync_FiltersByPartialRequestNumber`, `SearchAsync_FiltersByMultipleStatuses`, `SearchAsync_RespectsPageAndPageSize`. **מגבלה לתעד**: הטסטים האלה מוודאים נכונות לוגית (אילו שורות חוזרות, לא יותר) — הם **לא** יכולים לוודא ניצול אינדקס/יעילות שאילתה בפועל, כי InMemory לא מיישם את זה. זו אותה מגבלה שתועדה בהחלטה 6.i, ברמת הטסטים.

**Auth (חדש, בעקבות 6.ii — אופציה B)** — קובץ חדש, `tests/Requests.Tests/AuthServiceTests.cs`, כנגד `AuthService` אמיתי מול EF Core InMemory (שם DB ייחודי לכל טסט) וכמה `AppUser` Seed קבועים: `LoginAsync_WithCorrectCredentials_ReturnsToken`, `LoginAsync_WithWrongPassword_ReturnsNull`, `LoginAsync_WithUnknownUsername_ReturnsNull`, `GeneratedToken_ContainsExpectedClaims` (מפענח את ה-Token שחזר ומוודא `NameIdentifier`/Role תואמים למשתמש).

### מדור 3: Frontend (Angular + Angular Material)

**הקמה** (פעולות CLI): מהשורש, `ng new frontend --style=scss --ssr=false` (**בלי** `--routing=false` — נדרש Angular Router אמיתי, 6.ii) בתוך `CandidateTest/`; אחר כך `cd frontend && ng add @angular/material` (Theme לבחירה, Typography=Yes, Animations=Yes).

**מבנה תיקיות** תחת `frontend/src/app/`: `core/models/` (`request.model.ts`, `request-search-query.model.ts`, `paged-result.model.ts`, `auth.model.ts`), `core/services/` (`requests-api.service.ts`, `auth.service.ts`), `core/interceptors/` (`auth.interceptor.ts`), `core/guards/` (`auth.guard.ts`), `features/auth/login-page/`, `features/request-search/` עם שלוש תת-תיקיות קומפוננטה (`request-search-page/`, `request-filter-form/`, `request-results-table/`), ובשורש: `app.routes.ts`, `app.config.ts`, `app.component.ts/.html/.scss`.

- `core/models/request.model.ts` — `interface RequestDto` עם `id`, `requestNumber`, `customerId`, `ownerId`, `assignedToUserId` (`number | null`), `status`, `requestType`, `createdAt` (`string`), ועוד שני `enum`: `RequestStatus`, `RequestType` (ערכים תואמים למספרים של ה-Backend).
- `core/models/request-search-query.model.ts` — `interface RequestSearchQuery` תואם 1:1 ל-Record של ה-Backend.
- `core/models/paged-result.model.ts` — `interface PagedResult<T>` עם `items: T[]`, `totalCount`, `page`, `pageSize`.
- `core/models/auth.model.ts` — `interface LoginRequest { username: string; password: string; }`, `interface LoginResult { token: string; expiresAtUtc: string; }`.
- `core/services/requests-api.service.ts` — `@Injectable({providedIn:'root'})`, מתודה יחידה `search(query: RequestSearchQuery): Observable<PagedResult<RequestDto>>`, בונה `HttpParams` (כולל `statuses` כפרמטר חוזר), קורא `GET /api/requests`.
- `core/services/auth.service.ts` (במקום `current-user.service.ts` — 6.ii) — `@Injectable({providedIn:'root'})`. `login(username: string, password: string): Observable<void>` — קורא ל-Backend, שומר את ה-Token ב-`sessionStorage`. `logout(): void` — מנקה `sessionStorage`, מנווט ל-`/login`. `getToken(): string | null`. Signals לתצוגה בלבד (`isLoggedIn`, `currentUsername`, `isAdmin`) — מפוענחים מתוך ה-Payload של ה-JWT בצד לקוח **רק לצורך תצוגה** (למשל "מחוברת כ-alice"), **לא** כמקור אמת לאבטחה — האכיפה האמיתית תמיד בצד שרת.
- `core/interceptors/auth.interceptor.ts` (במקום `current-user.interceptor.ts` — 6.ii) — `HttpInterceptorFn` פונקציונלי: מצרף `Authorization: Bearer <token>` מ-`AuthService.getToken()`; עם `catchError` שתופס 401 — קורא ל-`AuthService.logout()` ומנווט ל-`/login?sessionExpired=true` (טיפול יפה בפקיעה, בלי Refresh Token — ר' 6.ii). נרשם ב-`app.config.ts` דרך `provideHttpClient(withInterceptors([authInterceptor]))`.
- `core/guards/auth.guard.ts` (חדש — 6.ii) — `CanActivateFn` פונקציונלי: בודק `AuthService.isLoggedIn()`; אם לא מחוברת, מחזיר `UrlTree` להפניה ל-`/login`. מוצמד ל-Route של `/search` (ר' `app.routes.ts` למטה).
- `features/request-search/request-search-page/request-search-page.component.ts` — Component "חכם" יחיד: `FormGroup` לפילטרים, `signal`-ים ל-Sort/Page, צירוף ל-`RequestSearchQuery`, קריאה ל-`RequestsApiService.search`, ניהול `loading`/`error`/`results` כ-Signals, Debounce (300ms) על `form.valueChanges` + ביטול בקשה קודמת (RxJS `switchMap`). מארח בתוכו את שלושת הקומפוננטות הבאות.
- `features/request-search/request-filter-form/request-filter-form.component.ts` — Component "טיפש", `@Input() form: FormGroup` בלבד, בלי State/HTTP משלו. שדות: RequestNumber (`mat-input`), Statuses (`mat-select multiple`), RequestType (`mat-select`), טווח תאריכים (`mat-date-range-input`).
- `features/request-search/request-results-table/request-results-table.component.ts` — Component "טיפש": `@Input() rows`, `@Input() totalCount`, `@Input() loading`, `@Input() errorMessage`, `@Output() sortChange`, `@Output() pageChange`. `mat-table` + `matSort` + `mat-paginator` — **בלי** לחבר `MatTableDataSource` למקור מובנה; רק מזרים אירועים החוצה, וה-Page הורה מחליט מה קורה איתם (קריאת Backend מחדש עם Page/Sort חדשים).
- `features/auth/login-page/login-page.component.ts` (במקום `current-user-switcher` — 6.ii) — טופס Reactive (`mat-input` ל-Username, `mat-input type=password` ל-Password), קורא ל-`AuthService.login(...)`. הצלחה → `router.navigate(['/search'])`; כישלון → `mat-error` עם הודעה ברורה. קורא Query Param `sessionExpired` (מוזרק ע"י `auth.interceptor.ts`) כדי להציג באנר "ההתחברות פגה, יש להתחבר מחדש" כשמגיעים לכאן אחרי 401.
- `app.routes.ts` (חדש — 6.ii) — `const routes: Routes`: `{ path: 'login', component: LoginPageComponent }`, `{ path: 'search', component: RequestSearchPageComponent, canActivate: [authGuard] }`, `{ path: '', redirectTo: 'search', pathMatch: 'full' }`, `{ path: '**', redirectTo: 'search' }`.
- `app.config.ts` — `provideHttpClient(withInterceptors([authInterceptor]))`, `provideRouter(routes)`, `provideAnimationsAsync()`.
- `app.component.ts` — `mat-toolbar` עליון (שם האפליקציה + שם המשתמש המחובר מ-`AuthService.currentUsername` + כפתור Logout, מוצגים רק כש-`isLoggedIn()`), ומתחתיו `<router-outlet>` יחיד — לא מארח יותר קומפוננטות ישירות.

### סדר בנייה מומלץ (Checklist מקושר)
1. **DB**: `OnModelCreating` (אינדקסים, לא נאכפים בפועל — 6.i) → `DbSet<AppUser>` → `UserSeeder` (Admin אחד + Regular, מותאם ל-`OwnerId`/`AssignedToUserId` הקיימים). **בלי** Migration/Connection String (InMemory, 6.i).
2. **Backend/Application**: `ICurrentUser` → `PagedResult<T>` → `ValidationException` → `RequestSearchQuery` → `RequestSearchQueryValidator` → עדכון `IRequestRepository`/`IRequestService`/`RequestService` → **Auth**: `LoginRequest`/`LoginResult` → `IAuthService` → `IJwtTokenGenerator`.
3. **Backend/Infrastructure**: `RequestSortExpressions` → עדכון `RequestRepository` → עדכון `DependencyInjection.cs` → **Identity**: `AppUser` → `JwtTokenGenerator` → `AuthService` → `UserSeeder`.
4. **Backend/Api**: `ClaimsCurrentUserAccessor` → `ValidationExceptionHandler` → `AuthController` → עדכון `RequestsController` (`[Authorize]`) → עדכון `Program.cs` (`AddJwtBearer` וסדר ה-Pipeline) → `appsettings.json` (`Jwt`, `Cors`).
5. **Backend/Tests**: `TestCurrentUser` → עדכון `RequestServiceTests` → `RequestRepositoryTests` חדש → `AuthServiceTests` חדש.
6. **נקודת בדיקה**: `dotnet build` + `dotnet test` על כל הפתרון, לפני מעבר ל-Frontend. בדיקה ידנית ב-Swagger: Login מחזיר Token תקין, `GET api/requests` בלי Token → 401, עם Token → 200.
7. **Frontend**: הקמת פרויקט (עם Router!) → Models (כולל `auth.model.ts`) → `AuthService` → `auth.interceptor.ts` → `auth.guard.ts` → `app.routes.ts` → Components מבפנים-החוצה (Table → Form → Login Page → Search Page → App Shell עם Router-Outlet).

---

## איך נאמת בהמשך (לאחר מימוש)

לאחר אישור התוכנית ומעבר למימוש:
1. **Backend**: `dotnet build` על ה-`.sln` החדש; `dotnet test` — לוודא ששני הטסטים שנכתבו-מחדש עוברים, בנוסף לטסטים החדשים על חיפוש/עימוד/הרשאות.
2. **הרצה ידנית דרך Swagger** — `GET /api/requests` עם צירופי query params שונים (סינון בודד/מרובה, טווח תאריכים לא תקין → לוודא 400, מיון, עימוד).
3. **הוכחת אכיפת הרשאות server-side** — Login עם שני משתמשים שונים (Admin מול Regular, ר' `UserSeeder`), קריאה עם כל Token בנפרד, ולוודא שסט התוצאות משתנה בהתאם — שמשתמש רגיל לעולם לא מקבל שורה שלא בבעלותו/מוקצית אליו.
4. **Frontend מול Backend חי** — להריץ את שני הצדדים יחד, לבדוק את כל המצבים (טעינה/שגיאה/ריק/תוצאות), את מסך ה-Login (הצלחה/כישלון), ואת ההפניה חזרה ל-Login עם הודעה ברורה כש-Token פג/לא תקין.
5. **בדיקת ביצועים בסיסית** (אם עברו ל-SQLite/DB רלציוני) — להריץ `EXPLAIN QUERY PLAN`/Execution Plan על שאילתת החיפוש ולוודא שהאינדקסים אכן נבחרים.

**קבצים קריטיים למימוש:**
- [IRequestRepository.cs](CandidateTest/src/Requests.Application/Requests/IRequestRepository.cs) ו-[IRequestService.cs](CandidateTest/src/Requests.Application/Requests/IRequestService.cs) — ה-Ports שמשתנים ראשונים ומכתיבים את השאר.
- [RequestService.cs](CandidateTest/src/Requests.Application/Requests/RequestService.cs) — שם נוחתים ה-Orchestration מבוסס-`ICurrentUser` וה-Validation.
- [RequestRepository.cs](CandidateTest/src/Requests.Infrastructure/Repositories/RequestRepository.cs) — שם קורית הרכבת ה-`IQueryable` עם דחיפת ההרשאות, העימוד וה-Projection.
- [RequestsDbContext.cs](CandidateTest/src/Requests.Infrastructure/Persistence/RequestsDbContext.cs) — שם נוחתים אינדקסי `OnModelCreating` והחלטת ה-Provider (i).
- [RequestsController.cs](CandidateTest/src/Requests.Api/Controllers/RequestsController.cs) — שם נוחתים ה-Query binding, תפר ה-`ICurrentUser`, וה-400-ים מבוססי Validation.

</div>
