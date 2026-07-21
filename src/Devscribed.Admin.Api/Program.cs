using System.Security.Claims;
using Devscribed.Admin.Api.AccountSettings;
using Devscribed.Admin.Api.ForgotPassword;
using Devscribed.Admin.Api.Invitations;
using Devscribed.Admin.Api.Login;
using Devscribed.Admin.Api.Members;
using Devscribed.Admin.Api.ResetPassword;
using Devscribed.Admin.Api.Signup;
using Devscribed.Admin.Domain.Services;
using Devscribed.Admin.Infrastructure.Data;
using Devscribed.Admin.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddSingleton<IEmailService, NoOpEmailService>();
builder.Services.AddSingleton<IAccountEmailService, NoOpAccountEmailService>();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromDays(7);
        options.SlidingExpiration = true;
        options.Events.OnValidatePrincipal = async context =>
        {
            var stamp = context.Principal?.FindFirstValue("SecurityStamp");
            if (stamp == null)
            {
                context.RejectPrincipal();
                return;
            }

            var accountIdClaim = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
            if (accountIdClaim == null || !Guid.TryParse(accountIdClaim, out var accountId))
            {
                context.RejectPrincipal();
                return;
            }

            var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
            var account = await db.Accounts.FindAsync(accountId);
            if (account == null || account.SecurityStamp != stamp)
            {
                context.RejectPrincipal();
            }
        };
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = 401;
            return Task.CompletedTask;
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapSignupEndpoint();
app.MapLoginEndpoint();
app.MapForgotPasswordEndpoint();
app.MapResetPasswordEndpoint();
app.MapMembersEndpoint();
app.MapMeEndpoint();
app.MapMemberManagementEndpoints();
app.MapMemberDetailEndpoints();
app.MapInvitationEndpoints();
app.MapAccountSettingsEndpoints();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

app.Run();

public partial class Program { }
