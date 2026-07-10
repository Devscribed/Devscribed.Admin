using Devscribed.Admin.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Data;

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
            e.HasIndex(a => a.Email).IsUnique();
            e.Property(a => a.Email).HasMaxLength(254);
            e.Property(a => a.FirstName).HasMaxLength(50);
            e.Property(a => a.LastName).HasMaxLength(50);
            e.Property(a => a.PhoneCountryCode).HasMaxLength(5);
            e.Property(a => a.PhoneNumber).HasMaxLength(20);
            e.Property(a => a.FirstDayOfWeek).HasMaxLength(10);
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
            e.Property(m => m.JobTitle).HasMaxLength(100);
            e.HasOne(m => m.Account).WithOne(a => a.Membership).HasForeignKey<Membership>(m => m.AccountId);
            e.HasOne(m => m.Organization).WithMany(o => o.Memberships).HasForeignKey(m => m.OrganizationId);
        });

        modelBuilder.Entity<PasswordResetToken>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.TokenHash);
            e.HasOne(t => t.Account).WithMany().HasForeignKey(t => t.AccountId);
        });

        modelBuilder.Entity<Invitation>(e =>
        {
            e.HasKey(i => i.Id);
            e.Property(i => i.Email).HasMaxLength(254);
            e.Property(i => i.Role).HasMaxLength(20);
            e.Property(i => i.Status).HasMaxLength(20);
            e.HasIndex(i => i.TokenHash).IsUnique();
            e.HasIndex(i => new { i.Email, i.OrganizationId, i.Status });
            e.HasOne(i => i.Organization).WithMany().HasForeignKey(i => i.OrganizationId);
        });

        modelBuilder.Entity<PendingEmailChange>(e =>
        {
            e.HasKey(p => p.Id);
            e.Property(p => p.NewEmail).HasMaxLength(254);
            e.HasIndex(p => p.TokenHash).IsUnique();
            e.HasIndex(p => new { p.AccountId, p.IsInvalidated });
            e.HasOne(p => p.Account).WithMany().HasForeignKey(p => p.AccountId);
        });
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var membershipsJustRemoved = ChangeTracker.Entries<Membership>()
            .Where(entry => entry.State == EntityState.Modified
                          && entry.Property(m => m.Status).CurrentValue == "removed"
                          && entry.Property(m => m.Status).OriginalValue != "removed")
            .Select(entry => entry.Entity.Id)
            .ToList();

        if (membershipsJustRemoved.Count > 0)
        {
            var invitationsToInvalidate = await Invitations
                .Where(i => membershipsJustRemoved.Contains(i.InviterMembershipId) && i.Status == "pending")
                .ToListAsync(cancellationToken);

            foreach (var invitation in invitationsToInvalidate)
                invitation.Status = "invalidated";
        }

        return await base.SaveChangesAsync(cancellationToken);
    }
}
