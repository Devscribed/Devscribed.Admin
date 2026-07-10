using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Tests.Unit;

public class AdminRoleTests
{
    [Fact]
    public async Task Creator_is_assigned_admin_role()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var db = new AppDbContext(options);
        var service = new SignupService(db, new FakeHasher());

        var result = await service.SignupAsync(new SignupRequest
        {
            OrgName = "Test Org",
            FirstName = "Pat",
            LastName = "Owner",
            Email = "pat@test.com",
            Password = "Password1",
        });

        Assert.True(result.Succeeded);
        var membership = await db.Memberships.SingleAsync();
        Assert.Equal("admin", membership.Role);
        Assert.Equal("active", membership.Status);
    }

    private class FakeHasher : IPasswordHasher
    {
        public string Hash(string password) => "hashed";
        public bool Verify(string password, string hash) => true;
    }
}
