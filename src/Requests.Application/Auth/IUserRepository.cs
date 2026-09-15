using Requests.Domain.Entities;

namespace Requests.Application.Auth;

public interface IUserRepository
{
    Task<User?> FindByUsernameAsync(string username, CancellationToken cancellationToken = default);
}
