using Requests.Domain.Entities;

namespace Requests.Application.Auth;

public interface IPasswordHasher
{
    string Hash(User user, string password);

    bool Verify(User user, string password);
}
