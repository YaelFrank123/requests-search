namespace Requests.Application.Common;

public interface ICurrentUser
{
    int UserId { get; }
    bool IsAdministrator { get; }
}
