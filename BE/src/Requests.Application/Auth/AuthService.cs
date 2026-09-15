namespace Requests.Application.Auth;

public sealed class AuthService : IAuthService
{
    private readonly IUserRepository _users;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IJwtTokenGenerator _tokenGenerator;

    public AuthService(IUserRepository users, IPasswordHasher passwordHasher, IJwtTokenGenerator tokenGenerator)
    {
        _users = users;
        _passwordHasher = passwordHasher;
        _tokenGenerator = tokenGenerator;
    }

    public async Task<LoginResult?> LoginAsync(LoginCommand command, CancellationToken cancellationToken = default)
    {
        var user = await _users.FindByUsernameAsync(command.Username, cancellationToken);
        if (user is null)
            return null;

        if (!_passwordHasher.Verify(user, command.Password))
            return null;

        var token = _tokenGenerator.Generate(user);
        return new LoginResult(token.Token, token.ExpiresAt, user.Role.ToString(), user.Username);
    }
}
