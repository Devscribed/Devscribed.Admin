using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Devscribed.Admin.Tests.Integration;

[Collection("Integration")]
public class MembersEndpointTests
{
    private readonly IntegrationTestFixture _fixture;

    public MembersEndpointTests(IntegrationTestFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task After_signup_the_creator_is_the_sole_active_admin_member()
    {
        var payload = new
        {
            orgName = "Acme Members Co",
            firstName = "Pat",
            lastName = "Owner",
            email = "members-owner@acme.com",
            password = "Passwor1",
            timezone = "America/New_York",
        };

        var signupResponse = await _fixture.HttpClient.PostAsJsonAsync("/api/signup", payload);
        Assert.True(signupResponse.IsSuccessStatusCode, await signupResponse.Content.ReadAsStringAsync());

        var membersResponse = await _fixture.HttpClient.GetAsync("/api/members");
        Assert.Equal(HttpStatusCode.OK, membersResponse.StatusCode);

        var members = await membersResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, members.GetArrayLength());

        var member = members[0];
        Assert.Equal("Pat Owner", member.GetProperty("name").GetString());
        Assert.Equal("admin", member.GetProperty("role").GetString());
        Assert.Equal("active", member.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Unauthenticated_request_is_rejected()
    {
        using var anonymousClient = _fixture.CreateClient();

        var response = await anonymousClient.GetAsync("/api/members");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
