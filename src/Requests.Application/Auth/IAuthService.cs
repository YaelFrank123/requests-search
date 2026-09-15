namespace Requests.Application.Auth;

public sealed record LoginCommand(string Username, string Password);

public sealed record LoginResult(string Token, DateTime ExpiresAt, string Role, string Username);

public interface IAuthService
{
    Task<LoginResult?> LoginAsync(LoginCommand command, CancellationToken cancellationToken = default);
}
