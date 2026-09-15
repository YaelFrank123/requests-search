using Requests.Domain.Entities;

namespace Requests.Application.Auth;

public sealed record GeneratedToken(string Token, DateTime ExpiresAt);

public interface IJwtTokenGenerator
{
    GeneratedToken Generate(User user);
}
