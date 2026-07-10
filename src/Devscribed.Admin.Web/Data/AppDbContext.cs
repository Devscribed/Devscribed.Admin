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
    public DbSet<MemberFinancials> MemberFinancials => Set<MemberFinancials>();
    public DbSet<MemberFinancialsSnapshot> MemberFinancialsSnapshots => Set<MemberFinancialsSnapshot>();
    public DbSet<VacationReserveTransaction> VacationReserveTransactions => Set<VacationReserveTransaction>();

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

        modelBuilder.Entity<MemberFinancials>(e =>
        {
            e.HasKey(f => f.Id);
            e.HasIndex(f => f.MembershipId).IsUnique();
            e.Property(f => f.MonthlySalary).HasPrecision(10, 2);
            e.Property(f => f.ClientHourlyRate).HasPrecision(8, 2);
            e.Property(f => f.VacationReservePercent).HasPrecision(5, 2);
            e.Property(f => f.Currency).HasMaxLength(3);
            e.HasOne(f => f.Membership).WithOne().HasForeignKey<MemberFinancials>(f => f.MembershipId);
        });

        modelBuilder.Entity<MemberFinancialsSnapshot>(e =>
        {
            e.HasKey(s => s.Id);
            e.HasIndex(s => new { s.MembershipId, s.EffectiveFrom });
            e.Property(s => s.MonthlySalary).HasPrecision(10, 2);
            e.Property(s => s.ClientHourlyRate).HasPrecision(8, 2);
            e.Property(s => s.VacationReservePercent).HasPrecision(5, 2);
            e.Property(s => s.Currency).HasMaxLength(3);
        });

        modelBuilder.Entity<VacationReserveTransaction>(e =>
        {
            e.HasKey(t => t.Id);
            e.Property(t => t.Type).HasMaxLength(20);
            e.Property(t => t.Amount).HasPrecision(12, 2);
            e.Property(t => t.Description).HasMaxLength(200);
            e.HasIndex(t => new { t.MembershipId, t.Type, t.BillingPeriodYear, t.BillingPeriodMonth });
            e.HasOne(t => t.Membership).WithMany().HasForeignKey(t => t.MembershipId);
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
