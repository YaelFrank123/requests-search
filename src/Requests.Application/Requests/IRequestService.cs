using Requests.Application.Common;
using Requests.Application.Requests.Search;

namespace Requests.Application.Requests;

public interface IRequestService
{
    Task<PagedResult<RequestDto>> SearchAsync(RequestSearchQuery query, CancellationToken cancellationToken = default);
}
