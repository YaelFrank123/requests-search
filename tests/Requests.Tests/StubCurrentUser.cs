using Requests.Application.Common;

namespace Requests.Tests;

public sealed class StubCurrentUser : ICurrentUser
{
    public int UserId { get; set; }
    public bool IsAdministrator { get; set; }
}
