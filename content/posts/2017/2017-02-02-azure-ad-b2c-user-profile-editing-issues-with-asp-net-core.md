---
title: Azure AD B2C user profile editing issues with ASP.NET Core
date: 2017-02-02 16:52:00
permalink: azure-ad-b2c-user-profile-editing-issues-with-asp-net-core
excerpt: One of the policy types supported by Azure AD B2C is profile editing which allows users to provide their info such as address details, job title, etc. When you use the default ASP.NET Core OpenID Connect middleware to handle communication with Azure AD B2C you may run into difficulties...
uuid: 3e419b4c-e8fb-4727-98b7-52776e33a8e0
tags: Azure Active Directory, ASP.NET
---

One of the policy types supported by Azure AD B2C is profile editing which allows users to provide their info such as address details, job title, etc. When you use the default ASP.NET Core OpenID Connect middleware to handle communication with Azure AD B2C you may run into difficulties making it properly redirect to the profile page and then handle the response when being called back by Azure AD.

**Update:** Please check out [this](/setting-up-your-asp-net-core-2-0-apps-and-services-for-azure-ad-b2c/) post for up-to-date info covering ASP.NET Core 2.0.

To invoke a B2C policy your application is expected to make a request to the authorize endpoint passing the required `p` parameter which identifies the policy. For example, when signing in users you would use either a 'Sign-in' or 'Sign-up or Sign-in' policy type:

```
GET https://login.microsoftonline.com/devunleashedb2c.onmicrosoft.com/oauth2/v2.0/authorize?p=B2C_1_TestSignUpAndSignInPolicy&client_id=...&redirect_uri=... HTTP/1.1
```

When redirecting to the profile editing page you would provide a name of your "Profile editing' policy:

```
GET https://login.microsoftonline.com/devunleashedb2c.onmicrosoft.com/oauth2/v2.0/authorize?p=B2C_1_TestProfileEditPolicy&client_id=...&redirect_uri=... HTTP/1.1
```

The middleware takes care of providing the rest of the [protocol](http://openid.net/specs/openid-connect-core-1_0.html#AuthRequest) parameters as well as state and nonce values which are used to later validate and correlate the response from Azure AD.

The way you trigger this whole process is by returning a ChallengeResult, e.g.:

```
public class AccountController : Controller
{
    private readonly B2CPolicies policies;

    public AccountController(IOptions<B2CPolicies> policies)
    {
        this.policies = policies.Value;
    }
    
    public IActionResult Profile()
    {
        if (User.Identity.IsAuthenticated)
        {
            return new ChallengeResult(
                AuthConstants.OpenIdConnectB2CAuthenticationScheme,
                new AuthenticationProperties(new Dictionary<string, string> { { AuthConstants.B2CPolicy, policies.EditProfilePolicy } })
                {
                    RedirectUri = "/"
                });
        }

        return RedirectHome();
    }

    private IActionResult RedirectHome() => RedirectToAction(nameof(HomeController.Index), "Home");
}
```

This will make `AuthenticationManager` invoke the challenge with the middleware identified by the provided authentication scheme (`AuthConstants.OpenIdConnectB2CAuthenticationScheme`) and in case of the OpenID Connect middleware it should make a request to the authorize endpoint. If you're wondering about the policy parameter I recommend you have a look at my [older post](/setting-up-your-aspnet-core-apps-and-services-for-azure-ad-b2c/) explaining how it is used when determining the correct configuration endpoint.

Now, here's the first problem. Instead of being redirected to Azure AD B2C, you are likely to witness an immediate redirect to some `AccessDenied` action on your `AccountController`:

```
GET https://localhost:8686/Account/Profile HTTP/1.1

HTTP/1.1 302 Found
Content-Length: 0
Location: https://localhost:8686/Account/AccessDenied?ReturnUrl=%2F

```

The problem lies in the middleware that treats challenge responses thrown when there is an authenticated user for the current request as failed authorization. Thus, it tries to invoke the `AccessDenied` action so you could present the error to the user.

However, from our workflow it's not an error and we expect the user to be authenticated before she can edit her profile.

You solve this we need to force the middleware to go with the same flow as it would when signing in users. This can be done with `Microsoft.AspNetCore.Http.Features.Authentication.ChallengeBehavior` enumeration however `ChallengeResult` currently doesn't provide a constructor that accepts it. So we'll have to write our own result:

```
internal class CustomChallengeResult : ChallengeResult
{
    private readonly ChallengeBehavior behavior;

    public CustomChallengeResult(string authenticationScheme, AuthenticationProperties properties, ChallengeBehavior behavior)
        : base(authenticationScheme, properties)
    {
        this.behavior = behavior;
    }
    public override async Task ExecuteResultAsync(ActionContext context)
    {
        if (context == null)
        {
            throw new ArgumentNullException(nameof(context));
        }

        var loggerFactory = context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>();
        var logger = loggerFactory.CreateLogger<CustomChallengeResult>();

        var authentication = context.HttpContext.Authentication;

        if (AuthenticationSchemes != null && AuthenticationSchemes.Count > 0)
        {
            logger.LogInformation("Executing CustomChallengeResult with authentication schemes: {0}.", AuthenticationSchemes.Aggregate((aggr, current) => $"{aggr}, {current}"));

            foreach (var scheme in AuthenticationSchemes)
            {
                await authentication.ChallengeAsync(scheme, Properties, behavior);
            }
        }
        else
        {
            logger.LogInformation("Executing CustomChallengeResult.");
            await authentication.ChallengeAsync(Properties);
        }
    }
}
```

Now make sure to specify `ChallengeBehavior.Unauthorized` when returning the result:

```
if (User.Identity.IsAuthenticated)
{
    return new CustomChallengeResult(
        AuthConstants.OpenIdConnectB2CAuthenticationScheme,
        new AuthenticationProperties(new Dictionary<string, string> { { AuthConstants.B2CPolicy, policies.EditProfilePolicy } })
        {
            RedirectUri = "/"
        }, ChallengeBehavior.Unauthorized);
}
```

This will successfully redirect the user to the profile editing page:

![Azure AD B2C profile editing page](https://blogcontent.azureedge.net/2017/01/b2c_edit_profile.png)

If the user hits 'Continue' she will be redirected back to the application with the regular authentication response containing state, nonce, authorization code and ID token (depending on the OpenID Connect flow).

But if the user hits 'Cancel' Azure AD B2C will return an error response, oops:

```
POST https://localhost:8686/signin-oidc-b2c HTTP/1.1
Content-Type: application/x-www-form-urlencoded

error=access_denied
&
error_description=AADB2C90091: The user has cancelled entering self-asserted information.
Correlation ID: 3ed683a1-d742-4f59-beb8-86bc22bb7196
Timestamp: 2017-01-30 12:15:15Z
```

This somewhat unexpected response from Azure AD makes the middleware fail the authentication process. And it's correct from the middleware's standpoint as there are no artifacts to validate.

To mitigate this we're going to have to intercept the response and prevent the middleware from raising an error:

```
private static IOpenIdConnectEvents CreateOpenIdConnectEventHandlers(B2CAuthenticationOptions authOptions, B2CPolicies policies)
{
    return new OpenIdConnectEvents
    {
        ...
        OnMessageReceived = context =>
        {
            if (!string.IsNullOrEmpty(context.ProtocolMessage.Error) &&
                !string.IsNullOrEmpty(context.ProtocolMessage.ErrorDescription) &&
                context.ProtocolMessage.ErrorDescription.StartsWith("AADB2C90091") &&
                context.Properties.Items[AuthConstants.B2CPolicy] == policies.EditProfilePolicy)
            {
                context.Ticket = new AuthenticationTicket(context.HttpContext.User, context.Properties, AuthConstants.OpenIdConnectB2CAuthenticationScheme);
                context.HandleResponse();
            }

            return Task.FromResult(0);
        }
    };
}
```

`OnMessageReceived` event allows us to examine all responses received from the identity provider and also abort further processing. In our case, we're interested in profile editing and we check the policy value that has been set `AccountController` and we look for the specific `AADB2C90091` error.s

We reconstruct the authentication ticket from the current principal and we know we can do that as the profile editing flow is only enabled for authenticated users. `context.HandleResponse()` is what makes the middleware back off and return the successful authentication result with our ticket to `AuthenticationManager`.

Please have a look at the complete [solution](https://github.com/dzimchuk/azure-ad-b2c-asp-net-core) so all pieces come together.