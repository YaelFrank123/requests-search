using Requests.Application.Requests.Search;
using Requests.Domain.Entities;
using Requests.Infrastructure.Repositories;
using Xunit;

namespace Requests.Tests;

public class RequestRepositorySearchTests
{
    private static User NewUser(int id) => new()
    {
        Id = id,
        Username = $"user{id}",
        PasswordHash = "n/a",
        Role = UserRole.User
    };

    private static Request NewRequest(int id, string number, int ownerId, int? assigneeId, RequestStatus status, RequestType type, DateTime createdAt) => new()
    {
        Id = id,
        RequestNumber = number,
        CustomerId = 1,
        OwnerId = ownerId,
        AssignedToUserId = assigneeId,
        Status = status,
        RequestType = type,
        CreatedAt = createdAt,
        UpdatedAt = createdAt
    };

    [Fact]
    public async Task RegularUser_SeesOnlyOwnedOrAssignedRequests()
    {
        using var db = new SqliteTestDatabase();
        var now = DateTime.UtcNow;

        db.Context.Users.AddRange(NewUser(1), NewUser(2), NewUser(3));
        db.Context.Requests.AddRange(
            NewRequest(1, "REQ-000001", ownerId: 1, assigneeId: null, RequestStatus.New, RequestType.Legal, now),
            NewRequest(2, "REQ-000002", ownerId: 3, assigneeId: 1, RequestStatus.New, RequestType.Legal, now),
            NewRequest(3, "REQ-000003", ownerId: 2, assigneeId: 3, RequestStatus.New, RequestType.Legal, now));
        await db.Context.SaveChangesAsync();

        var currentUser = new StubCurrentUser { UserId = 1, IsAdministrator = false };
        var repository = new RequestRepository(db.Context, currentUser);

        var result = await repository.SearchAsync(new RequestSearchQuery());

        Assert.Equal(2, result.TotalCount);
        Assert.All(result.Items, x => Assert.True(x.OwnerId == 1 || x.AssignedToUserId == 1));
    }

    [Fact]
    public async Task Administrator_SeesAllRequests()
    {
        using var db = new SqliteTestDatabase();
        var now = DateTime.UtcNow;

        db.Context.Users.AddRange(NewUser(1), NewUser(2), NewUser(3));
        db.Context.Requests.AddRange(
            NewRequest(1, "REQ-000001", ownerId: 1, assigneeId: null, RequestStatus.New, RequestType.Legal, now),
            NewRequest(2, "REQ-000002", ownerId: 3, assigneeId: 1, RequestStatus.New, RequestType.Legal, now),
            NewRequest(3, "REQ-000003", ownerId: 2, assigneeId: 3, RequestStatus.New, RequestType.Legal, now));
        await db.Context.SaveChangesAsync();

        var currentUser = new StubCurrentUser { UserId = 1, IsAdministrator = true };
        var repository = new RequestRepository(db.Context, currentUser);

        var result = await repository.SearchAsync(new RequestSearchQuery());

        Assert.Equal(3, result.TotalCount);
    }

    [Fact]
    public async Task RequestNumber_MatchesMidString()
    {
        using var db = new SqliteTestDatabase();
        var now = DateTime.UtcNow;

        db.Context.Users.Add(NewUser(1));
        db.Context.Requests.Add(NewRequest(1, "REQ-000123", ownerId: 1, assigneeId: null, RequestStatus.New, RequestType.Legal, now));
        await db.Context.SaveChangesAsync();

        var currentUser = new StubCurrentUser { UserId = 1, IsAdministrator = true };
        var repository = new RequestRepository(db.Context, currentUser);

        var result = await repository.SearchAsync(new RequestSearchQuery { RequestNumber = "000123" });

        Assert.Single(result.Items);
        Assert.Equal("REQ-000123", result.Items[0].RequestNumber);
    }

    [Fact]
    public async Task StatusFilter_CombinesWithPermissionRestriction_ForRegularUser()
    {
        using var db = new SqliteTestDatabase();
        var now = DateTime.UtcNow;

        db.Context.Users.AddRange(NewUser(1), NewUser(2));
        db.Context.Requests.AddRange(
            NewRequest(1, "REQ-000001", ownerId: 1, assigneeId: null, RequestStatus.New, RequestType.Legal, now),
            NewRequest(2, "REQ-000002", ownerId: 1, assigneeId: null, RequestStatus.Completed, RequestType.Legal, now),
            // Matches the status filter but belongs to a different user — must be excluded.
            NewRequest(3, "REQ-000003", ownerId: 2, assigneeId: null, RequestStatus.New, RequestType.Legal, now));
        await db.Context.SaveChangesAsync();

        var currentUser = new StubCurrentUser { UserId = 1, IsAdministrator = false };
        var repository = new RequestRepository(db.Context, currentUser);

        var result = await repository.SearchAsync(new RequestSearchQuery { Status = [RequestStatus.New] });

        Assert.Equal(1, result.TotalCount);
        Assert.Equal("REQ-000001", Assert.Single(result.Items).RequestNumber);
    }

    [Fact]
    public async Task Paging_ReturnsCorrectRowsAndTotal()
    {
        using var db = new SqliteTestDatabase();
        var now = DateTime.UtcNow;

        db.Context.Users.Add(NewUser(1));
        for (var i = 1; i <= 30; i++)
        {
            db.Context.Requests.Add(NewRequest(
                i, $"REQ-{i:D6}", ownerId: 1, assigneeId: null, RequestStatus.New, RequestType.Legal,
                now.AddMinutes(i)));
        }
        await db.Context.SaveChangesAsync();

        var currentUser = new StubCurrentUser { UserId = 1, IsAdministrator = true };
        var repository = new RequestRepository(db.Context, currentUser);

        var result = await repository.SearchAsync(new RequestSearchQuery { Page = 1, PageSize = 10 });

        Assert.Equal(30, result.TotalCount);
        Assert.Equal(10, result.Items.Count);
        Assert.True(result.TotalCount > result.Items.Count);
    }
}
