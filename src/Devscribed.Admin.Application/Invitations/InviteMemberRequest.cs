using Devscribed.Admin.Domain;

namespace Devscribed.Admin.Application.Invitations;

public record InviteMemberRequest(string Email, MembershipRole Role);
