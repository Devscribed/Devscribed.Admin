using Devscribed.Admin.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<Membership> Memberships => Set<Membership>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<Invitation> Invitations => Set<Invitation>();
    public DbSet<PendingEmailChange> PendingEmailChanges => Set<PendingEmailChange>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Account>(e =>
        {
            e.HasKey(a => a.Id);
            e.Property(a => a.Email).HasMaxLength(254).IsRequired();
            e.HasIndex(a => a.Email).IsUnique();
            e.Property(a => a.PasswordHash).IsRequired();
            e.Property(a => a.FirstName).HasMaxLength(50).IsRequired();
            e.Property(a => a.LastName).HasMaxLength(50).IsRequired();
            e.Property(a => a.Timezone).HasMaxLength(100);
            e.Property(a => a.PhoneCountryCode).HasMaxLength(5);
            e.Property(a => a.PhoneNumber).HasMaxLength(20);
            e.Property(a => a.FirstDayOfWeek).HasMaxLength(10).HasDefaultValue("Monday");
            e.Property(a => a.SecurityStamp).HasMaxLength(100).IsRequired();
        });

        modelBuilder.Entity<Organization>(e =>
        {
            e.HasKey(o => o.Id);
            e.Property(o => o.Name).HasMaxLength(100).IsRequired();
        });

        modelBuilder.Entity<Membership>(e =>
        {
            e.HasKey(m => m.Id);
            e.Property(m => m.Role).HasConversion<string>().HasMaxLength(20).IsRequired();
            e.Property(m => m.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
            e.Property(m => m.JobTitle).HasMaxLength(100);
            e.HasIndex(m => new { m.AccountId, m.OrganizationId }).IsUnique();
            e.HasOne(m => m.Account).WithMany().HasForeignKey(m => m.AccountId);
            e.HasOne(m => m.Organization).WithMany().HasForeignKey(m => m.OrganizationId);
        });

        modelBuilder.Entity<PasswordResetToken>(e =>
        {
            e.HasKey(t => t.Id);
            e.Property(t => t.TokenHash).HasMaxLength(128).IsRequired();
            e.Property(t => t.IsInvalidated).HasDefaultValue(false);
            e.HasOne(t => t.Account).WithMany().HasForeignKey(t => t.AccountId);
            e.HasIndex(t => t.TokenHash);
            e.HasIndex(t => t.AccountId);
        });

        modelBuilder.Entity<PendingEmailChange>(e =>
        {
            e.HasKey(p => p.Id);
            e.Property(p => p.NewEmail).HasMaxLength(254).IsRequired();
            e.Property(p => p.TokenHash).HasMaxLength(128).IsRequired();
            e.Property(p => p.IsInvalidated).HasDefaultValue(false);
            e.HasOne(p => p.Account).WithMany().HasForeignKey(p => p.AccountId);
            e.HasIndex(p => p.TokenHash).IsUnique();
            e.HasIndex(p => new { p.AccountId, p.IsInvalidated });
        });

        modelBuilder.Entity<Invitation>(e =>
        {
            e.HasKey(i => i.Id);
            e.Property(i => i.Email).HasMaxLength(254).IsRequired();
            e.Property(i => i.Role).HasConversion<string>().HasMaxLength(20).IsRequired();
            e.Property(i => i.TokenHash).HasMaxLength(128).IsRequired();
            e.Property(i => i.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
            e.HasIndex(i => i.TokenHash).IsUnique();
            e.HasIndex(i => new { i.Email, i.OrganizationId, i.Status });
            e.HasOne(i => i.Organization).WithMany().HasForeignKey(i => i.OrganizationId);
            e.HasOne(i => i.InviterMembership).WithMany().HasForeignKey(i => i.InviterMembershipId);
        });
    }
}
