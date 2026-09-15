namespace Requests.Application.Requests.Search;

public static class RequestSortFields
{
    public const string RequestNumber = "requestNumber";
    public const string Status = "status";
    public const string RequestType = "requestType";
    public const string CreatedAt = "createdAt";

    public const string Ascending = "asc";
    public const string Descending = "desc";

    public static readonly HashSet<string> Permitted = new(StringComparer.OrdinalIgnoreCase)
    {
        RequestNumber, Status, RequestType, CreatedAt
    };

    public static readonly HashSet<string> Directions = new(StringComparer.OrdinalIgnoreCase)
    {
        Ascending, Descending
    };
}
