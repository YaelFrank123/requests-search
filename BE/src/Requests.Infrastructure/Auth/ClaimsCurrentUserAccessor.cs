using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Requests.Application.Common;
using Requests.Domain.Entities;

namespace Requests.Infrastructure.Auth;

public sealed class ClaimsCurrentUserAccessor : ICurrentUser
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public ClaimsCurrentUserAccessor(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public int UserId
    {
        get
        {
            var value = _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(value, out var userId)
                ? userId
                : throw new InvalidOperationException(
                    "The authenticated principal carries no usable NameIdentifier claim.");
        }
    }

    public bool IsAdministrator
        => _httpContextAccessor.HttpContext?.User.IsInRole(nameof(UserRole.Administrator)) ?? false;
}
