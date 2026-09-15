using Microsoft.EntityFrameworkCore;
using Requests.Application.Auth;
using Requests.Domain.Entities;
using Requests.Infrastructure.Persistence;

namespace Requests.Infrastructure.Repositories;

public sealed class UserRepository : IUserRepository
{
    private readonly RequestsDbContext _db;

    public UserRepository(RequestsDbContext db)
    {
        _db = db;
    }

    public Task<User?> FindByUsernameAsync(string username, CancellationToken cancellationToken = default)
        => _db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Username == username, cancellationToken);
}
