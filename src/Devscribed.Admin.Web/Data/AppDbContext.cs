using Devscribed.Admin.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<Membership> Memberships => Set<Membership>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Account>(e =>
        {
            e.HasKey(a => a.Id);
            e.HasIndex(a => a.Email).IsUnique();
            e.Property(a => a.Email).HasMaxLength(254);
            e.Property(a => a.FirstName).HasMaxLength(50);
            e.Property(a => a.LastName).HasMaxLength(50);
        });

        modelBuilder.Entity<Organization>(e =>
        {
            e.HasKey(o => o.Id);
            e.Property(o => o.Name).HasMaxLength(100);
        });

        modelBuilder.Entity<Membership>(e =>
        {
            e.HasKey(m => m.Id);
            e.HasIndex(m => m.AccountId).IsUnique();
            e.HasOne(m => m.Account).WithOne(a => a.Membership).HasForeignKey<Membership>(m => m.AccountId);
            e.HasOne(m => m.Organization).WithMany(o => o.Memberships).HasForeignKey(m => m.OrganizationId);
        });
    }
}
