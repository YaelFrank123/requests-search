using Microsoft.EntityFrameworkCore;
using Requests.Application.Auth;

namespace Requests.Infrastructure.Persistence;

public static class DbSeeder
{
    private const int RowCount = 200_000;
    private const int UserCount = 1_000;

    // Bulk-inserted users never log in, so their hash never needs to verify
    // against anything — only ids 1 and 2 (the demo accounts) get a real hash below.
    private const string UnusedPasswordHash = "N/A";

    public const string AdminDemoPassword = "Admin123!";
    public const string UserDemoPassword = "User123!";

    private const string SeedUsersSql = """
        INSERT INTO Users (Username, PasswordHash, Role)
        WITH RECURSIVE seq(i) AS (
            SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < {0}
        )
        SELECT printf('user%04d', i), {1}, 0
        FROM seq;
        """;

    private const string SeedRequestsSql = """
        INSERT INTO Requests
            (RequestNumber, CustomerId, OwnerId, AssignedToUserId, Status, RequestType, CreatedAt, UpdatedAt)
        WITH RECURSIVE seq(i) AS (
            SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < {0}
        )
        SELECT printf('REQ-%06d', i),
               (i % 100) + 1,
               (i % 1000) + 1,
               CASE WHEN i % 7 = 0 THEN NULL ELSE ((i + 1) % 1000) + 1 END,
               (i % 4) + 1,
               ((i / 4) % 4) + 1,
               datetime('now', '-' || (i % 365) || ' days'),
               datetime('now', '-' || (i % 100) || ' days')
        FROM seq;
        """;

    public static void Seed(RequestsDbContext db, IPasswordHasher passwordHasher)
    {
        if (db.Users.Any() || db.Requests.Any())
            return;

        db.Database.ExecuteSqlRaw(SeedUsersSql, UserCount, UnusedPasswordHash);

        var admin = db.Users.Single(x => x.Id == 1);
        admin.Username = "admin";
        admin.Role = Domain.Entities.UserRole.Administrator;
        admin.PasswordHash = passwordHasher.Hash(admin, AdminDemoPassword);

        var user = db.Users.Single(x => x.Id == 2);
        user.Username = "user";
        user.Role = Domain.Entities.UserRole.User;
        user.PasswordHash = passwordHasher.Hash(user, UserDemoPassword);

        db.SaveChanges();

        db.Database.ExecuteSqlRaw(SeedRequestsSql, RowCount);
    }
}
