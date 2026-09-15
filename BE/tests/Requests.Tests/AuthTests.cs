using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Requests.Application.Auth;
using Requests.Domain.Entities;
using Requests.Infrastructure.Auth;
using Requests.Infrastructure.Persistence;
using Xunit;

namespace Requests.Tests;

public class AuthTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public AuthTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Login_SucceedsForCorrectCredentials_AndReturnsIdenticalBodyForBothFailureCases()
    {
        using var client = _factory.CreateClient();

        var success = await client.PostAsJsonAsync("/api/auth/login",
            new LoginCommand("admin", DbSeeder.AdminDemoPassword));
        Assert.Equal(HttpStatusCode.OK, success.StatusCode);
        var successBody = await success.Content.ReadFromJsonAsync<LoginResult>();
        Assert.False(string.IsNullOrWhiteSpace(successBody!.Token));

        var wrongPassword = await client.PostAsJsonAsync("/api/auth/login", new LoginCommand("admin", "not-the-password"));
        var unknownUser = await client.PostAsJsonAsync("/api/auth/login", new LoginCommand("nobody", "whatever"));

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownUser.StatusCode);

        // REQ-F-012's actual criterion: the two failure bodies must be indistinguishable,
        // not merely share a status code — otherwise a different message would leak which usernames exist.
        var wrongPasswordBody = await wrongPassword.Content.ReadAsStringAsync();
        var unknownUserBody = await unknownUser.Content.ReadAsStringAsync();
        Assert.Equal(wrongPasswordBody, unknownUserBody);
    }

    [Fact]
    public async Task RequestsEndpoint_EnforcesBearerAuthentication()
    {
        using var anonymousClient = _factory.CreateClient();
        var noHeader = await anonymousClient.GetAsync("/api/requests");
        Assert.Equal(HttpStatusCode.Unauthorized, noHeader.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var jwtOptions = scope.ServiceProvider.GetRequiredService<IOptions<JwtOptions>>().Value;
        var expiredGenerator = new JwtTokenGenerator(Options.Create(new JwtOptions
        {
            Key = jwtOptions.Key,
            Issuer = jwtOptions.Issuer,
            Audience = jwtOptions.Audience,
            ExpiryMinutes = -5
        }));
        var expiredToken = expiredGenerator.Generate(new User { Id = 1, Role = UserRole.Administrator });

        using var expiredClient = _factory.CreateClient();
        expiredClient.DefaultRequestHeaders.Authorization = new("Bearer", expiredToken.Token);
        var expired = await expiredClient.GetAsync("/api/requests");
        // Only holds because Program.cs sets ClockSkew = TimeSpan.Zero; the library's 5-minute
        // default would still validate a token expired by a few seconds and this would fail.
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);

        using var authenticatedClient = _factory.CreateClient();
        var login = await authenticatedClient.PostAsJsonAsync("/api/auth/login",
            new LoginCommand("admin", DbSeeder.AdminDemoPassword));
        var loginResult = await login.Content.ReadFromJsonAsync<LoginResult>();
        authenticatedClient.DefaultRequestHeaders.Authorization = new("Bearer", loginResult!.Token);
        var valid = await authenticatedClient.GetAsync("/api/requests");
        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);
    }
}
