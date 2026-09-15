using System.ComponentModel.DataAnnotations;
using Requests.Domain.Entities;

namespace Requests.Application.Requests.Search;

public record RequestSearchQuery : IValidatableObject
{
    public const int MaxPageSize = 100;

    public string? RequestNumber { get; init; }
    public List<RequestStatus> Status { get; init; } = new();
    public RequestType? RequestType { get; init; }
    public DateTime? CreatedFrom { get; init; }
    public DateTime? CreatedTo { get; init; }
    public string? SortBy { get; init; }
    public string? SortDirection { get; init; }
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 25;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Status.Any(s => !Enum.IsDefined(s)))
            yield return new ValidationResult("Status contains an undefined value.", new[] { "status" });

        if (RequestType.HasValue && !Enum.IsDefined(RequestType.Value))
            yield return new ValidationResult("RequestType is not a defined value.", new[] { "requestType" });

        if (CreatedFrom.HasValue && CreatedTo.HasValue && CreatedFrom.Value > CreatedTo.Value)
            yield return new ValidationResult("CreatedFrom cannot be later than CreatedTo.", new[] { "createdFrom" });

        if (SortBy is not null && !RequestSortFields.Permitted.Contains(SortBy))
            yield return new ValidationResult("SortBy is not a supported sort key.", new[] { "sortBy" });

        if (SortDirection is not null && !RequestSortFields.Directions.Contains(SortDirection))
            yield return new ValidationResult("SortDirection must be 'asc' or 'desc'.", new[] { "sortDirection" });

        if (Page < 1)
            yield return new ValidationResult("Page must be at least 1.", new[] { "page" });

        if (PageSize < 1 || PageSize > MaxPageSize)
            yield return new ValidationResult($"PageSize must be between 1 and {MaxPageSize}.", new[] { "pageSize" });
    }
}
