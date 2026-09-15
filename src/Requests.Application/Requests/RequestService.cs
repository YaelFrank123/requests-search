using Requests.Application.Common;
using Requests.Application.Requests.Search;

namespace Requests.Application.Requests;

public sealed class RequestService : IRequestService
{
    private readonly IRequestRepository _repository;

    public RequestService(IRequestRepository repository)
    {
        _repository = repository;
    }

    public Task<PagedResult<RequestDto>> SearchAsync(RequestSearchQuery query, CancellationToken cancellationToken = default)
        => _repository.SearchAsync(query, cancellationToken);
}
