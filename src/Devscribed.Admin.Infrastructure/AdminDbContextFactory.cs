using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Devscribed.Admin.Infrastructure;

/// <summary>
/// Design-time factory so `dotnet ef` can create the context without the Web project's DI container.
/// </summary>
public class AdminDbContextFactory : IDesignTimeDbContextFactory<AdminDbContext>
{
    public AdminDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<AdminDbContext>();
        optionsBuilder.UseSqlite("Data Source=devscribed-admin-design.db");
        return new AdminDbContext(optionsBuilder.Options);
    }
}
