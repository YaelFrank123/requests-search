using System.ComponentModel.DataAnnotations;
using Requests.Application.Requests.Search;
using Xunit;

namespace Requests.Tests;

public class RequestSearchQueryValidationTests
{
    [Fact]
    public void InvertedDateRange_IsRejected()
    {
        var query = new RequestSearchQuery
        {
            CreatedFrom = new DateTime(2026, 9, 1),
            CreatedTo = new DateTime(2026, 1, 1)
        };

        var results = query.Validate(new ValidationContext(query)).ToList();

        var error = Assert.Single(results);
        Assert.Contains("createdFrom", error.MemberNames);
    }
}
