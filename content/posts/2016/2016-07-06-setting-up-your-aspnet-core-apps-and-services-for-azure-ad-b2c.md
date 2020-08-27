---
title: Setting up your ASP.NET Core apps and services for Azure AD B2C
date: 2016-07-06T08:32:00.000Z
lastmod: 2017-12-18T20:09:46.000Z
permalink: setting-up-your-aspnet-core-apps-and-services-for-azure-ad-b2c
excerpt: So far we've been looking at corporate or organizational accounts in context of working with Azure AD. But for customer facing applications it's important to provide a way for users to register themselves and use their existing social accounts to authenticate with your applications.
uuid: 1ebee3df-453e-45f1-92f1-b629cacf4a6d
tags: Azure Active Directory, ASP.NET
---

So far we've been looking at corporate or organizational accounts in context of working with Azure AD. But for customer facing applications it's important to provide a way for users to register themselves and use their existing accounts in various well-known services to authenticate with your applications. Today we're going to look at Azure AD B2C, the service designed specifically to serve individuals consuming your apps, and how to configure it in your ASP.NET Core web applications.

**Update:** this post describes ASP.NET Core 1.x and is somewhat out of date. Please check out [this](/setting-up-your-asp-net-core-2-0-apps-and-services-for-azure-ad-b2c/) post instead.

## Setting up a directory

You still create B2C directories just like the regular directories on the classic portal.

![Creating an Azure AD B2C directory](https://blogcontent.azureedge.net/AzureAD_B2C.png)

Even though you have some tabs and you may try to configure from here, chances are it's not going to work. Things are pretty much in flux and rememver Azure AD B2C is itself in preview. So you gotta head to the new portal straight after to manage your newly created directory. Just make sure to select your B2C directory in the upper right corner.

![B2C app settings](https://blogcontent.azureedge.net/AzureAD_B2C_App.png)

The apps have pretty standard settings that you've probably got used to: Application (client) ID, secret (key), return URLs, etc. One important thing to note is that if you want to implement a delegated access scenario when you have a client app and some remote services both the app and the services will shared the same application in Azure AD B2C. I'm not sure if it will stay the same but for now this is way the things are.

I'm going to use a sample solution of two ASP.NET Core applications that you can clone from [GitHub](https://github.com/dzimchuk/azure-ad-b2c-asp-net-core).

## Configuring API application

Azure AD B2C uses v2 endpoints and its tokens are still in JWT format, same as organizational v1 endpoints. That means we need `Microsoft.AspNetCore.Authentication.JwtBearer` middleware and its configuration looks almost identical to the [one](/protecting-your-apis-with-azure-active-directory) we used for the classic directory.

```
public void Configure(IApplicationBuilder app, IOptions<AuthenticationOptions> authOptions)
{
    app.UseJwtBearerAuthentication(new JwtBearerOptions
    {
        AutomaticAuthenticate = true,
        AutomaticChallenge = true,

        MetadataAddress = 
            $"{authOptions.Value.Authority}/.well-known/openid-configuration?p={authOptions.Value.SignInOrSignUpPolicy}",
        Audience = authOptions.Value.Audience,

        Events = new JwtBearerEvents
                 {
                     OnAuthenticationFailed = ctx =>
                                              {
                                                  ctx.SkipToNextMiddleware();
                                                  return Task.FromResult(0);
                                              }
                 }
    });

    app.UseMvc();
}
```

Except for one thing: instead of setting the authority, which is our tenant's URL in the classic directory, we specify the full URL to the OpenID Connect metadata endpoint. And the reason for that is that query string parameter, called `p`, that identifies a policy. In Azure AD B2C policies define the end user experience and enable much greater customization options than the ones available in the classic directory. [Official documentation](https://azure.microsoft.com/en-us/documentation/articles/active-directory-b2c-reference-policies/) covers policies and other concepts in great details so I suggest you have a look at it.

In Azure AD B2C the policy is a required parameter in requests to authorization and token endpoints. For instance, if we query the metadata endpoint we get the following output:

```
HTTP/1.1 200 OK
Cache-Control: private
Content-Type: application/json; charset=utf-8
Server: Microsoft-IIS/8.5
Set-Cookie: x-ms-cpim-slice=001-000; domain=microsoftonline.com; path=/; secure; HttpOnly
Set-Cookie: x-ms-cpim-trans=; expires=Mon, 04-Jul-2016 20:02:00 GMT; path=/; secure; HttpOnly
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Set-Cookie: x-ms-gateway-slice=001-000; path=/; secure; HttpOnly
Set-Cookie: stsservicecookie=cpim_te; path=/; secure; HttpOnly
X-Powered-By: ASP.NET
Date: Tue, 05 Jul 2016 20:01:58 GMT
Content-Length: 1208

{
  "issuer": "https://login.microsoftonline.com/bc2fb659-725b-48d8-b571-7420094e41cc/v2.0/",
  "authorization_endpoint": "https://login.microsoftonline.com/devunleashedb2c.onmicrosoft.com/oauth2/v2.0/authorize?p=b2c_1_testsignupandsigninpolicy",
  "token_endpoint": "https://login.microsoftonline.com/devunleashedb2c.onmicrosoft.com/oauth2/v2.0/token?p=b2c_1_testsignupandsigninpolicy",
  "end_session_endpoint": "https://login.microsoftonline.com/devunleashedb2c.onmicrosoft.com/oauth2/v2.0/logout?p=b2c_1_testsignupandsigninpolicy",
  "jwks_uri": "https://login.microsoftonline.com/devunleashedb2c.onmicrosoft.com/discovery/v2.0/keys?p=b2c_1_testsignupandsigninpolicy",
  "response_modes_supported": [
    "query",
    "fragment",
    "form_post"
  ],
  "response_types_supported": [
    "code",
    "id_token",
    "code id_token"
  ],
  "scopes_supported": [
    "openid"
  ],
  "subject_types_supported": [
    "pairwise"
  ],
  "id_token_signing_alg_values_supported": [
    "RS256"
  ],
  "token_endpoint_auth_methods_supported": [
    "client_secret_post"
  ],
  "claims_supported": [
    "oid",
    "newUser",
    "idp",
    "emails",
    "name",
    "sub"
  ]
}
```

Not only does it provide policy specific endpoints, it also gives information about claims that I configured to be inluded in tokens for this specific policy.

## Configuring a web client application

In ASP.NET Core web client we use the same pair of cookies and OpenID Connect middleware that we used [before](/accessing-azure-ad-protected-resources-using-openid-connect) and we are also going take advantage of ADAL library to help us with token management. As you probably rememeber one of the reasons we use ADAL is to support Azure AD specific requirements. In case of the class directory this is the `resource` parameter however it's not relevant anymore in Azure AD B2C. Here we have another required parameter: `p` and thus we need a special version of ADAL that supports it.

Another special case with Azure AD B2C is that its token endpoints do not issue access tokens. Yup, they will give ID tokens with optional refresh tokens and you're supposed to use ID tokens as access tokens when calling your API apps. The standard OpenID Connect middleware cannot be used to redeem the authorization code as it will fail to find access token in the response. 

```
"dependencies": {
    "Microsoft.AspNetCore.Authentication.Cookies": "1.0.0",
    "Microsoft.AspNetCore.Authentication.OpenIdConnect": "1.0.0",
    "Microsoft.Experimental.IdentityModel.Clients.ActiveDirectory": "4.0.209160138-alpha"
}
```

It's called 'experimental' and Azure AD team likely is going to switch or focus its efforts on the new libaray called [MSAL](https://www.nuget.org/packages/Microsoft.Identity.Client) for all v2 endpoints including B2C. So you definitely want to keep an eye on that but meanwhile we're going use the experimental ADAL package.

```
app.UseCookieAuthentication(new CookieAuthenticationOptions
{
    AutomaticAuthenticate = true
});

var openIdConnectOptions = new OpenIdConnectOptions
{
    AuthenticationScheme = Constants.OpenIdConnectAuthenticationScheme,
    AutomaticChallenge = true,

    Authority = authOptions.Value.Authority,
    ClientId = authOptions.Value.ClientId,
    ClientSecret = authOptions.Value.ClientSecret,
    PostLogoutRedirectUri = authOptions.Value.PostLogoutRedirectUri,

    ConfigurationManager = new PolicyConfigurationManager(authOptions.Value.Authority, 
        new[] { b2cPolicies.Value.SignInOrSignUpPolicy, b2cPolicies.Value.EditProfilePolicy }),
    Events = CreateOpenIdConnectEventHandlers(authOptions.Value, b2cPolicies.Value),

    ResponseType = OpenIdConnectResponseType.CodeIdToken,
    TokenValidationParameters = new TokenValidationParameters
    {
        NameClaimType = "name"
    },

    SignInScheme = CookieAuthenticationDefaults.AuthenticationScheme
};

openIdConnectOptions.Scope.Add("offline_access");
```

If you've been following my posts on working with Azure AD or have been playing with on your own most of the parameters should be familiar to you. I will just describe the settings that are unique to Azure AD B2C. If we want to get refresh tokens we need to add a special scope `offline_access` and we also need to implement a configuration manager that takes into account policies when making requests to metadata endpoints. Remember that the default behavior is to simply append `.well-known/openid-configuration` to the authority parameter and it's not enough in this case.

A possible implementation of the `PolicyConfigurationManager` can be found in official samples and [here](https://github.com/dzimchuk/azure-ad-b2c-asp-net-core/blob/master/TestApp/Infrastructure/PolicyConfigurationManager.cs) you can find the one I used in my demo solution.

`CreateOpenIdConnectEventHandlers` allows us to intercept the flow by subscribing to various events:

```
private static IOpenIdConnectEvents CreateOpenIdConnectEventHandlers(B2CAuthenticationOptions authOptions, B2CPolicies policies)
{
    return new OpenIdConnectEvents
    {
        OnRedirectToIdentityProvider = context => SetIssuerAddressAsync(context, policies.SignInOrSignUpPolicy),
        OnRedirectToIdentityProviderForSignOut = context => SetIssuerAddressForSignOutAsync(context, policies.SignInOrSignUpPolicy),
        OnAuthorizationCodeReceived = async context =>
        {
          var credential = new ClientCredential(authOptions.ClientId, authOptions.ClientSecret);
          var authenticationContext = new AuthenticationContext(authOptions.Authority);
          var result = await authenticationContext.AcquireTokenByAuthorizationCodeAsync(context.TokenEndpointRequest.Code,
                             new Uri(context.TokenEndpointRequest.RedirectUri, UriKind.RelativeOrAbsolute), credential,
                             new[] { authOptions.ClientId }, context.Ticket.Principal.FindFirst(Constants.AcrClaimType).Value);

          context.HandleCodeRedemption();
        },
        OnAuthenticationFailed = context =>
        {
            context.HandleResponse();
            context.Response.Redirect("/home/error");
            return Task.FromResult(0);
        }
    };
}

private static async Task SetIssuerAddressAsync(RedirectContext context, string defaultPolicy)
{
    var configuration = await GetOpenIdConnectConfigurationAsync(context, defaultPolicy);
    context.ProtocolMessage.IssuerAddress = configuration.AuthorizationEndpoint;
}

private static async Task SetIssuerAddressForSignOutAsync(RedirectContext context, string defaultPolicy)
{
    var configuration = await GetOpenIdConnectConfigurationAsync(context, defaultPolicy);
    context.ProtocolMessage.IssuerAddress = configuration.EndSessionEndpoint;
}

private static async Task<OpenIdConnectConfiguration> GetOpenIdConnectConfigurationAsync(RedirectContext context, string defaultPolicy)
{
    var manager = (PolicyConfigurationManager)context.Options.ConfigurationManager;
    var policy = context.Properties.Items.ContainsKey(Constants.B2CPolicy) ? context.Properties.Items[Constants.B2CPolicy] : defaultPolicy;
    var configuration = await manager.GetConfigurationByPolicyAsync(CancellationToken.None, policy);
    return configuration;
}
```

As you can see we need to set the correct endpoint addresses including the policy parameter when the user gets redirected to the authorization and sign-out pages. We use our custom `PolicyConfigurationManager` to determine the correct endpoints based on the `Constants.B2CPolicy` property that is set by the [AccountController](https://github.com/dzimchuk/azure-ad-b2c-asp-net-core/blob/master/TestApp/Controllers/AccountController.cs) in response to appropriate actions: sign in, sign up, edit profile or sign out. Please check out the code to get a better picture of how things work.

`OnAuthorizationCodeReceived` is where we redeem the authorization code using the experimental version of ADAL. We need a policy parameter and `Constants.AcrClaimType` corresponds to `http://schemas.microsoft.com/claims/authnclassreference` claim that is present in ID tokens issued by Azure AD B2C and this claim contains the name of the active policy. Finally, we need to notify the OpenID Connect middleware that we've managed code redemption by calling `context.HandleCodeRedemption()`.