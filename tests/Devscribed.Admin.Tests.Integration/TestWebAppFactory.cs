using Devscribed.Admin.Web.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

public class TestWebAppFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = Guid.NewGuid().ToString();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            var descriptors = services
                .Where(d => d.ServiceType == typeof(DbContextOptions<AppDbContext>)
                          || d.ServiceType.FullName?.Contains("EntityFrameworkCore") == true)
                .ToList();
            foreach (var d in descriptors) services.Remove(d);

            services.AddDbContext<AppDbContext>(options =>
                options.UseInMemoryDatabase(_dbName));

            var emailDescriptors = services
                .Where(d => d.ServiceType == typeof(Devscribed.Admin.Web.Services.IEmailSender))
                .ToList();
            foreach (var d in emailDescriptors) services.Remove(d);

            services.AddSingleton<InMemoryEmailSender>();
            services.AddSingleton<Devscribed.Admin.Web.Services.IEmailSender>(sp => sp.GetRequiredService<InMemoryEmailSender>());
        });
    }
}
