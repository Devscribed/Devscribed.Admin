using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Security;
using Devscribed.Admin.Web.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT");
if (port != null)
    builder.WebHost.UseUrls($"http://localhost:{port}");

builder.Services.AddRazorPages();
builder.Services.AddControllers();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")
                      ?? "Data Source=devscribed.db"));

builder.Services.AddScoped<SignupService>();
builder.Services.AddScoped<LoginService>();
builder.Services.AddScoped<PasswordResetService>();
builder.Services.AddScoped<InvitationService>();
builder.Services.AddScoped<MembersService>();
builder.Services.AddScoped<AccountSettingsService>();
builder.Services.AddScoped<EmailChangeService>();
builder.Services.AddScoped<ChangePasswordService>();
builder.Services.AddScoped<VacationLedgerService>();
builder.Services.AddScoped<VacationService>();
builder.Services.AddScoped<VacationAccrualService>();
builder.Services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
builder.Services.AddSingleton<ITokenGenerator, TokenGenerator>();
builder.Services.AddSingleton<IEmailSender, ConsoleEmailSender>();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/login";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;

        options.Events.OnValidatePrincipal = async context =>
        {
            var accountIdClaim = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
            var securityStampClaim = context.Principal?.FindFirstValue(AppClaimTypes.SecurityStamp);

            if (accountIdClaim == null || !Guid.TryParse(accountIdClaim, out var accountId)
                || securityStampClaim == null || !Guid.TryParse(securityStampClaim, out var securityStamp))
            {
                context.RejectPrincipal();
                await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                return;
            }

            var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
            var currentStamp = await db.Accounts
                .Where(a => a.Id == accountId)
                .Select(a => (Guid?)a.SecurityStamp)
                .SingleOrDefaultAsync();

            if (currentStamp == null || currentStamp.Value != securityStamp)
            {
                context.RejectPrincipal();
                await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            }
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapRazorPages();
app.MapControllers();

app.Run();

public partial class Program { }
