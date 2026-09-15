using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Requests.Application.Auth;

namespace Requests.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResult>> Login(LoginCommand command, CancellationToken cancellationToken)
    {
        var result = await _authService.LoginAsync(command, cancellationToken);
        if (result is null)
            return Unauthorized(new { title = "Invalid username or password.", status = StatusCodes.Status401Unauthorized });

        return Ok(result);
    }
}
