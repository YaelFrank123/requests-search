using Microsoft.EntityFrameworkCore;
using Requests.Application.Common;
using Requests.Application.Requests;
using Requests.Application.Requests.Search;
using Requests.Domain.Entities;
using Requests.Infrastructure.Persistence;

namespace Requests.Infrastructure.Repositories;

public sealed class RequestRepository : IRequestRepository
{
    private readonly RequestsDbContext _db;
    private readonly ICurrentUser _currentUser;

    public RequestRepository(RequestsDbContext db, ICurrentUser currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    public async Task<PagedResult<RequestDto>> SearchAsync(RequestSearchQuery query, CancellationToken cancellationToken = default)
    {
        IQueryable<Request> requests = _db.Requests.AsNoTracking();

        if (!_currentUser.IsAdministrator)
        {
            var userId = _currentUser.UserId;
            requests = requests.Where(x => x.OwnerId == userId || x.AssignedToUserId == userId);
        }

        if (!string.IsNullOrEmpty(query.RequestNumber))
            requests = requests.Where(x => x.RequestNumber.Contains(query.RequestNumber));

        if (query.Status.Count > 0)
            requests = requests.Where(x => query.Status.Contains(x.Status));

        if (query.RequestType.HasValue)
            requests = requests.Where(x => x.RequestType == query.RequestType.Value);

        if (query.CreatedFrom.HasValue)
        {
            var from = DateTime.SpecifyKind(query.CreatedFrom.Value.Date, DateTimeKind.Utc);
            requests = requests.Where(x => x.CreatedAt >= from);
        }

        if (query.CreatedTo.HasValue)
        {
            var to = DateTime.SpecifyKind(query.CreatedTo.Value.Date.AddDays(1), DateTimeKind.Utc);
            requests = requests.Where(x => x.CreatedAt < to);
        }

        var totalCount = await requests.CountAsync(cancellationToken);

        requests = ApplySort(requests, query.SortBy, query.SortDirection);

        var items = await requests
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(x => new RequestDto(
                x.Id,
                x.RequestNumber,
                x.CustomerId,
                x.OwnerId,
                x.AssignedToUserId,
                x.Status,
                x.RequestType,
                x.CreatedAt))
            .ToListAsync(cancellationToken);

        return new PagedResult<RequestDto>(items, totalCount, query.Page, query.PageSize);
    }

    private static IQueryable<Request> ApplySort(IQueryable<Request> requests, string? sortBy, string? sortDirection)
    {
        var descending = string.Equals(sortDirection, RequestSortFields.Descending, StringComparison.OrdinalIgnoreCase);

        return sortBy?.ToLowerInvariant() switch
        {
            "requestnumber" => descending
                ? requests.OrderByDescending(x => x.RequestNumber).ThenBy(x => x.Id)
                : requests.OrderBy(x => x.RequestNumber).ThenBy(x => x.Id),
            "status" => descending
                ? requests.OrderByDescending(x => x.Status).ThenBy(x => x.Id)
                : requests.OrderBy(x => x.Status).ThenBy(x => x.Id),
            "requesttype" => descending
                ? requests.OrderByDescending(x => x.RequestType).ThenBy(x => x.Id)
                : requests.OrderBy(x => x.RequestType).ThenBy(x => x.Id),
            "createdat" => descending
                ? requests.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
                : requests.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id),
            _ => requests.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
        };
    }
}
