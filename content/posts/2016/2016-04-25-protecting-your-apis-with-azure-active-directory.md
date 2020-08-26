---
title: Protecting your APIs with Azure Active Directory
date: 2016-04-25 14:01:00
permalink: protecting-your-apis-with-azure-active-directory
excerpt: When building web APIs you inevitably have to decide on your security strategy. When making this important decision you want to go with a solution that is rock solid, scales well and enables modern work flows for users accessing your APIs...
uuid: 8715f911-9d72-4562-ac48-aa191678e113
tags: Azure Active Directory, ASP.NET
---

When building web APIs you inevitably have to decide on your security strategy. When making this important decision you want to go with a solution that is rock solid, scales well and enables modern work flows for users accessing your APIs from variety of devices as well as for other systems and components that may take advantage of integrating with your APIs. [Azure Active Directory](https://azure.microsoft.com/en-us/services/active-directory/) is a great SAAS offering that hits the spot when considering these factors.

In this post I'm going to demonstrate how you can quickly protect your ASP.NET Core based APIs with Azure AD. I won't go into much detail on AD internals and configuration tweaks to keep this post sane and in control but I'm planning a series of posts to dive deep into these topics.

## Creating API application in Azure AD

I'm going to be using my [Book Fast API](https://github.com/dzimchuk/book-fast-api) sample playground app and I want to protect it with Bearer tokens issued by Azure AD.

For an application to be recognized and protected by Azure AD it needs to be registered in it as, well, an application. That is true both for your APIs as well as your consuming apps. Let's go to the Active Directory section on the portal. You still get redirected to the classic portal to manage your AD tenants. On the 'Applications' tab you can choose to create a new app that 'your organization is developing'. You need to provide 4 things:

1. App name, obviously. I'm going to use 'book-fast-api'.
2. App type. In our case it's 'Web application and/or Web API'.
3. Sign-on URL. This is not important for API apps.
4. App ID URI. This is an important setting that uniquely defines you application. It will also be the value of the 'resource' that consumers will request access tokens for. It has to be a valid URI and you normally use your tenant address as part of it. My test tenant is 'devunleashed.onmicrosoft.com' so I set the app ID URI to 'https://devunleashed.onmicrosoft.com/book-fast-api'.

![New Azure AD dialog](https://blogcontent.azureedge.net/azuread-book-fast-api-create.png)

That's it. We have just created the app that can be accessed by other apps on behalf of their users. This is an important point! Azure AD by default configures apps so that they provide a delegated permission for other apps to access them on behalf of the signed in user.

See that 'Manage manifest' button at the bottom of the portal page of your application? Click it and choose to download the manifest.

```
"oauth2Permissions": [{
	"adminConsentDescription": "Allow the application to access book-fast-api on behalf of the signed-in user.",
	"adminConsentDisplayName": "Access book-fast-api",
	"id": "60260462-0895-4c20-91da-2b417a0bd41c",
	"isEnabled": true,
	"type": "User",
	"userConsentDescription": "Allow the application to access book-fast-api on your behalf.",
	"userConsentDisplayName": "Access book-fast-api",
	"value": "user_impersonation"
}]
```

`oauth2Permissions` collection defines delegated permissions your app provides to other apps. We will get back to assigning this permission to a client application later in this post but for now let's go to Visual Studio and enable Bearer authentication in the ASP.NET Core project containing our APIs.

## Enabling Bearer authentication in ASP.NET Core

There are a bunch of authentication middleware packages available for various scenarios and the one we need in our case is `Microsoft.AspNet.Authentication.JwtBearer`.

```
"dependencies": {
	"Microsoft.AspNet.Authentication.JwtBearer": "1.0.0-rc1-final"
}
```

Looking at the package name you probably have guessed that it understands [JSON Web Tokens](https://tools.ietf.org/html/rfc7519). In fact, [OAuth2](https://tools.ietf.org/html/rfc6749#page-10) spec doesn't prescribe the format for access tokens.

> Access tokens can have different formats, structures, and methods of utilization (e.g., cryptographic properties) based on the resource server security requirements.

Azure AD uses JWT for its access tokens that are obtained from OAuth2 token endpoints and thus this package is exactly what we need.

Once we've added the package we need to configure the authentication middleware.

```
public void ConfigureServices(IServiceCollection services)
{
    services.Configure<AuthenticationOptions>(configuration.GetSection("Authentication:AzureAd"));
}

public void Configure(IApplicationBuilder app, IHostingEnvironment env, ILoggerFactory loggerFactory, IOptions<AuthenticationOptions> authOptions)
{
    loggerFactory.AddConsole(Configuration.GetSection("Logging"));
    loggerFactory.AddDebug();

    app.UseIISPlatformHandler();
    app.UseJwtBearerAuthentication(options =>
                                   {
                                       options.AutomaticAuthenticate = true;
                                       options.AutomaticChallenge = true;
                                       options.Authority = authOptions.Value.Authority;
                                       options.Audience = authOptions.Value.Audience;
                                   });
    app.UseMvc();
}
```

`AutomaticAuthenticate` flag tells the middleware to look for the Bearer token in the headers of incoming requests and, if one is found, validate it. If validation is successful the middleware will populate the current `ClaimsPrincipal` associated with the request with claims (and potentially roles) obtained from the token. It will also mark the current identity as authenticated.

`AutomaticChallenge` flag tells the middleware to modify 401 responses that are coming from further middleware (MVC) and add appropriate challenge behavior. In case of Bearer authentication it's about adding the following header to the response:

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer
```

`Authority` option defines the tenant URL in Azure AD that issued the token. It consists of two parts: Azure AD instance URL, in my case this is 'https://login.microsoftonline.com/' and tenant ID which is a GUID that you can look up by opening the 'View endpoints' dialog on the portal. Alternately, you can also use a domain based tenant identifier which normally in the form of '<tenantName>.onmicrosoft.com' but Azure AD also allows you to assign custom domains to your tenants. So in my case I could either use 'https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0' or 'https://login.microsoftonline.com/devunleashed.onmicrosoft.com'.

In order to validate the token, `JwtBearerMiddleware` actually relies on OpenID Connect metadata endpoints provided by the authority to get details on encryption keys and algorithms that were used to sign the token. Even though I'm trying to stay with bare bones OAuth2 in this post it's worth mentioning that [OpenID Connect](http://openid.net/specs/openid-connect-core-1_0.html) solves many of the concerns that are not covered (defined) in OAuth2 spec and the existing middleware takes advantage of it. Azure AD of course fully supports it but this is a topic for another post.

The final important option to set is `Audience`. When issuing access tokens Azure AD requires the callers to provide a resource name (or intended audience) that they want to access using the token. This intended audience will be included as a claim in the token and will be verified by `JwtBearerMiddleware` when validating the token. When we created an application for Book Fast API we provided App ID URI (https://devunleashed.onmicrosoft.com/book-fast-api) which we will use as the resource identifier.

That's basically it. The way you enforce authentication on your MVC controllers and/or actions is a good old `AuthorizeAttribute` that will return 401 if the current principal is not authenticated.

#### Handling authentication errors

What should happen when an invalid or expired token has been provided? Ideally the middleware should trigger the same challenge flow as if no token was provided. The middleware allows you to handle authentication failure situations by providing an `OnAuthenticationFailed` callback method in `JwtBearerEvents` object which is part of `JwtBearerOptions` that we have just configured above.

Unfortunately, RC1 version of `Microsoft.AspNet.Authentication.JwtBearer` has a bug in the way it tries to handle our decision that we make in the `OnAuthenticationFailed`. No matter if we choose to `HandleResponse` or `SkipToNextMiddleware` it will try to instantiate a successful `AuthenticationResult` with no authentication ticket and of course this idea is not going to work. Looking at the [dev branch](https://github.com/aspnet/Security/blob/dev/src/Microsoft.AspNetCore.Authentication.JwtBearer/JwtBearerHandler.cs) I see there has been some [refactoring](https://github.com/aspnet/Security/commit/3f596108aac3d8fc7fb40d39e19a7f897a90c198) in the way that the authentication events are handled and hopefully the issue has been resolved.

In the meantime I've created a [fixed version](https://github.com/dzimchuk/book-fast-api/tree/v1/src/BookFast.Api/Infrastructure/JwtBearer) of the middleware targeting RC1 that allows you to skip to the next middleware if token validation fails which will allow the processing to hit the `AuthorizeAttribute` and retrigger the automatic challenge on 401:

```
var jwtBearerOptions = new JwtBearerOptions
                       {
                           AutomaticAuthenticate = true,
                           AutomaticChallenge = true,
                           Authority = authOptions.Value.Authority,
                           Audience = authOptions.Value.Audience,

                           Events = new JwtBearerEvents
                                    {
                                        OnAuthenticationFailed = ctx =>
                                                                 {
                                                                     ctx.SkipToNextMiddleware();
                                                                     return Task.FromResult(0);
                                                                 }
                                    }
                       };
app.UseMiddleware<CustomJwtBearerMiddleware>(jwtBearerOptions);
```

Alternately, we could call `ctx.HandleResponse()` and construct the challenge response ourselves to avoid hitting MVC middleware. But I prefer my version as it will allow calls with invalid tokens to endpoints that don't require authentication and/or authorization. In fact, the ultimate decision on whether the caller should be challenged or not should be made by the authorization filters.

## OAuth2 Client Credentials Grant flow

I can't finish this post without demonstrating a client application calling our protected API. OAuth2 spec defines both interactive as well as non-interactive flows. Interactive flows are used in scenarios when users give their consent to client applications to access resources on their behalf and non-interactive ones imply that the client application possesses all of the credentials they need to access resources on their own.

First, I'm going to demonstrate the [Client Credentials Grant](https://tools.ietf.org/html/rfc6749#page-40) flow that is used for server-to-server internal calls.

![OAuth2 Client Credential Grant](https://blogcontent.azureedge.net/OAuth2_Client_Credentials_Grant.png)

This flow is meant to be used with confidential clients, i.e. clients that are running on the server as opposed to those running on user devices (which are often referred to as 'public clients'). Confidential clients provide their client ID and client secret in the requests for access tokens. The resources they ask tokens for are accessed from their application's context rather than from their user's (resource owner's) context. That makes perfect sense as there are no user credentials involved.

#### Provisioning a client application in Azure AD

Steps for provisioning a client app are the same as for the API app. The app type is still 'Web application and/or Web API' which indicates that we are creating a confidential client.

On the 'Configure' tab we need to create a client key (secret) Keep it safe as the portal won't display it the next time you get back to the app's page.

Hit 'Save' and let's give it a ride.

#### Testing Client Credentials Grant flow

First let's hit the API without any token to make sure it's guarded:

```
GET https://localhost:44361/api/bookings HTTP/1.1
Host: localhost:44361


HTTP/1.1 401 Unauthorized
Content-Length: 0
Server: Kestrel
WWW-Authenticate: Bearer
```

Let's request a token from Azure AD (don't forget to URL encode your client secret!):

```
POST https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0/oauth2/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Host: login.microsoftonline.com
Content-Length: 197

resource=https://devunleashed.onmicrosoft.com/book-fast-api&grant_type=client_credentials&client_id=119f1731-3fd4-4c3d-acbc-2455879b0d54&client_secret=<client secret>


HTTP/1.1 200 OK
Cache-Control: no-cache, no-store
Pragma: no-cache
Content-Type: application/json; charset=utf-8
Content-Length: 1304

{
	"token_type": "Bearer",
	"expires_in": "3599",
	"expires_on": "1461341991",
	"not_before": "1461338091",
	"resource": "https://devunleashed.onmicrosoft.com/book-fast-api",
	"access_token": "<token value>"
}
```

Note that Client Credentials Grant doesn't return a refresh token because well it's useless in this case as you can always use your client credentials to request a new access token.

Let's call our API with the access token:

```
GET https://localhost:44361/api/bookings HTTP/1.1
Authorization: Bearer <token value>
Host: localhost:44361


HTTP/1.1 500 Internal Server Error
Content-Length: 0
Server: Kestrel
```

Well it failed miserably but trust me it's not related to the authentication part. The problem is that we are trying to get pending booking requests of a user and the application [tries to get](https://github.com/dzimchuk/book-fast-api/blob/master/src/BookFast.Api/Infrastructure/SecurityContextProvider.cs) a user name from the current principal's claims. It's specifically looking for the claim of type 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name' and it can't find it. And 500 is the correct response code here because we apparently screwed up the app logic here. User booking requests are expected to be queried under user context only, not under application context.

But no, don't take my words for granted. I am actually going to prove to you that authentication succeeded. Here's the debug output:

```
Microsoft.AspNet.Hosting.Internal.HostingEngine: Information: Request starting HTTP/1.1 GET http://localhost:44361/api/bookings  
Microsoft.AspNet.Authentication.JwtBearer.JwtBearerMiddleware: Information: HttContext.User merged via AutomaticAuthentication from authenticationScheme: Bearer.
Microsoft.AspNet.Authorization.DefaultAuthorizationService: Information: Authorization was successful for user: .
Microsoft.AspNet.Mvc.Controllers.ControllerActionInvoker: Information: Executing action method BookFast.Api.Controllers.BookingController.List with arguments () - ModelState is Valid'
...
...
Microsoft.AspNet.Server.Kestrel: Error: An unhandled exception was thrown by the application.
System.Exception: Claim 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name' was not found.
```

There is no user! It should remind us of the intended use of the Client Credentials Grant. We will try another OAuth2 flow a bit later but now let's take a break and have a look at the access token and take this opportunity to examine its content and better understand how token validation works.

## Access token validation

Remember that Azure AD access tokens are [JWT](https://jwt.io/)? And as such they consist of 2 Based64 endcoded JSON parts (header and payload) plus a signature. You can easily decode them, for example, with the Text Wizard tool in [Fiddler](http://www.telerik.com/fiddler):

![Azure AD access token decoded with Text Wizard](https://blogcontent.azureedge.net/azuread-book-fast-access-token.png)

And here's the readable part:

```
{
	"typ": "JWT",
	"alg": "RS256",
	"x5t": "MnC_VZcATfM5pOYiJHMba9goEKY",
	"kid": "MnC_VZcATfM5pOYiJHMba9goEKY"
}
{
	"aud": "https://devunleashed.onmicrosoft.com/book-fast-api",
	"iss": "https://sts.windows.net/70005c1f-ea47-488e-8f57-c3543485f1d0/",
	"iat": 1461338091,
	"nbf": 1461338091,
	"exp": 1461341991,
	"appid": "119f1731-3fd4-4c3d-acbc-2455879b0d54",
	"appidacr": "1",
	"idp": "https://sts.windows.net/70005c1f-ea47-488e-8f57-c3543485f1d0/",
	"oid": "970c6d5c-e200-481c-a134-6d0287f3c406",
	"sub": "970c6d5c-e200-481c-a134-6d0287f3c406",
	"tid": "70005c1f-ea47-488e-8f57-c3543485f1d0",
	"ver": "1.0"
}
```

The `aud` claim contains the intended audience that this token was requested for. `JwtBearerMiddleware` will compare it with the `Audience` property that we set when enabling it and will reject tokens should they contain a different value for the audience.

Another important claim is `iss` that represents the issuer STS and it is also verified when validating the token. But what is it compared to? And how does `JwtBearerMiddleware` validate the token's signature after all?

The middleware we use takes advantage of OpenID Connect discovery to get the data it needs. If you trace/capture HTTP traffic on the API app side with Fiddler you will discover that the API app makes 2 calls to Azure AD when validating the token. The first call is to the discovery endpoint. It's URL is formed as '<Authority>/.well-known/openid-configuration':

```
GET https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0/.well-known/openid-configuration HTTP/1.1


HTTP/1.1 200 OK
Cache-Control: private
Content-Type: application/json; charset=utf-8
Content-Length: 1239

{
	"authorization_endpoint": "https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0/oauth2/authorize",
	"token_endpoint": "https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0/oauth2/token",
	"token_endpoint_auth_methods_supported": ["client_secret_post",
	"private_key_jwt"],
	"jwks_uri": "https://login.microsoftonline.com/common/discovery/keys",
	"response_modes_supported": ["query",
	"fragment",
	"form_post"],
	"subject_types_supported": ["pairwise"],
	"id_token_signing_alg_values_supported": ["RS256"],
	"http_logout_supported": true,
	"response_types_supported": ["code",
	"id_token",
	"code id_token",
	"token id_token",
	"token"],
	"scopes_supported": ["openid"],
	"issuer": "https://sts.windows.net/70005c1f-ea47-488e-8f57-c3543485f1d0/",
	"claims_supported": ["sub",
	"iss",
	"aud",
	"exp",
	"iat",
	"auth_time",
	"acr",
	"amr",
	"nonce",
	"email",
	"given_name",
	"family_name",
	"nickname"],
	"microsoft_multi_refresh_token": true,
	"check_session_iframe": "https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0/oauth2/checksession",
	"end_session_endpoint": "https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0/oauth2/logout",
	"userinfo_endpoint": "https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0/openid/userinfo"
}
```

Lots of metadata here including the `issuer` value and the `jwks_uri` endpoint address to get the keys to validate the token's signature:

```
GET https://login.microsoftonline.com/common/discovery/keys HTTP/1.1


HTTP/1.1 200 OK
Cache-Control: private
Content-Type: application/json; charset=utf-8
Content-Length: 2932

{
	"keys": [{
		"kty": "RSA",
		"use": "sig",
		"kid": "MnC_VZcATfM5pOYiJHMba9goEKY",
		"x5t": "MnC_VZcATfM5pOYiJHMba9goEKY",
		"n": "vIqz-4-ER_vNWLON9yv8hIYV737JQ6rCl6X...",
		"e": "AQAB",
		"x5c": ["<X.509 Certificate Chain>"]
	},
	{
		"kty": "RSA",
		"use": "sig",
		"kid": "YbRAQRYcE_motWVJKHrwLBbd_9s",
		"x5t": "YbRAQRYcE_motWVJKHrwLBbd_9s",
		"n": "vbcFrj193Gm6zeo5e2_y54Jx49sIgScv-2J...",
		"e": "AQAB",
		"x5c": ["<X.509 Certificate Chain>"]
	}]
}
```

Token signing is implemented according to [JSON Web Key](https://tools.ietf.org/html/rfc7517) spec. Using Key ID and X.509 certificate thumbprint values from the token's header (`kid` and `x5t` parameters respectively) the middleware is able to find the appropriate public key in the obtained collection of keys to verify the signature.

## OAuth2 Resource Owner Password Credentials Grant flow

Let's fix our 500 issue with Book Fast API and try to get a list of booking requests under a user context. OAuth2 and OpenID Connect provide interactive flows that include secure gathering of user credentials but to keep this post short I'm going to demonstrate a simpler flow called [Resource Owner Credentials Grant](http://tools.ietf.org/html/rfc6749#page-37).

When developing new applications you should *not* use this flow as it requires your client applications to gather user credentials. This, in turn, lays the ground for all kinds of bad practices like, for instance, a temptation to preserve the credentials in the usable form to be able to make internal calls on behalf of users. It also puts the burden of maintaining user credentials (password resets, two factor auth, etc) on your shoulders.

This flow can be used though in legacy applications that are being re-architectured (such as adopting Azure AD and delegated access to services) as an intermediate solution.

![OAuth2 Resource Owner Credentials Grant](https://blogcontent.azureedge.net/OAuth2-Resource_Owner_Password_Credentials_Grant.png)

Ok, back to the 'Configure' page of the client app! We need to give it a delegated permission to call Book Fast API. Use 'Add application' button to find and add 'book-fast-api' to the list of apps and then select the delegated permission.

![Giving the client a delegated permission to access book-fast-api](https://blogcontent.azureedge.net/azuread-book-fast-delegated-permission2.png)

Note that the 'Access book-fast-api' permission is coming from the `oauth2Permissions` collection that we saw in the API's app manifest earlier.

If you do this under your admin account you essentially provide an admin consent for the client app to call the API app on behalf of *any* user of the tenant. It fits the current flow perfectly as there is no way for users to provide their consent to Active Directory as they don't go to its login pages.

Requesting a token now requires user credentials and the grant type of `password`:

```
POST https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0/oauth2/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Host: login.microsoftonline.com
Content-Length: 260

resource=https://devunleashed.onmicrosoft.com/book-fast-api&grant_type=password&client_id=119f1731-3fd4-4c3d-acbc-2455879b0d54&client_secret=<client secret>&username=newfella@devunleashed.onmicrosoft.com&password=<user password>


HTTP/1.1 200 OK
Cache-Control: no-cache, no-store
Pragma: no-cache
Content-Type: application/json; charset=utf-8
Content-Length: 2204

{
	"token_type": "Bearer",
	"scope": "user_impersonation",
	"expires_in": "3599",
	"expires_on": "1461602199",
	"not_before": "1461598299",
	"resource": "https://devunleashed.onmicrosoft.com/book-fast-api",
	"access_token": "<access token value>",
	"refresh_token": "<refresh token value>"
}
```

Same as other delegated flows, Resource Owner Password Grant also allows for an optional refresh token to be returned from the token endpoint. This token can be used by the client to ask for new access tokens without bothering the user to re-enter her credentials.

Let's have a quick glance at the access token:

```
{
	"aud": "https://devunleashed.onmicrosoft.com/book-fast-api",
	"iss": "https://sts.windows.net/70005c1f-ea47-488e-8f57-c3543485f1d0/",
	"iat": 1461598299,
	"nbf": 1461598299,
	"exp": 1461602199,
	"acr": "1",
	"amr": ["pwd"],
	"appid": "119f1731-3fd4-4c3d-acbc-2455879b0d54",
	"appidacr": "1",
	"ipaddr": "86.57.158.18",
	"name": "New Fella",
	"oid": "3ea83d38-dad6-4576-9701-9f0e153c32b5",
	"scp": "user_impersonation",
	"sub": "Qh3Yqwk86aMN8Oos_xCEDZcV2cfGi7PTl-5uSSgF4uE",
	"tid": "70005c1f-ea47-488e-8f57-c3543485f1d0",
	"unique_name": "newfella@devunleashed.onmicrosoft.com",
	"upn": "newfella@devunleashed.onmicrosoft.com",
	"ver": "1.0"
}
```

Now it contains claims mentioning my 'newfella@devunleashed.onmicrosoft.com' user and something tells me we're going to have a better luck calling the Book Fast API now!

```
GET https://localhost:44361/api/bookings HTTP/1.1
Authorization: Bearer <access token>


HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Server: Kestrel
Content-Length: 663

[{
	"Id": "7e63dd0c-0910-492f-a34b-a05d995455ce",
	"AccommodationId": "2c998dc6-1b90-4ba1-9885-5169e5c83c79",
	"AccommodationName": "Queen's dream",
	"FacilityId": "c08ffa8d-87fa-4315-8a54-0e744b33e7f7",
	"FacilityName": "First facility",
	"StreetAddress": "11, Test str.",
	"FromDate": "2016-06-10T00:00:00+03:00",
	"ToDate": "2016-06-18T00:00:00+03:00"
},
{
	"Id": "4e7f165f-a1d2-48ce-9b14-d2d8d5c04750",
	"AccommodationId": "2c998dc6-1b90-4ba1-9885-5169e5c83c79",
	"AccommodationName": "Queen's dream",
	"FacilityId": "c08ffa8d-87fa-4315-8a54-0e744b33e7f7",
	"FacilityName": "First facility",
	"StreetAddress": "11, Test str.",
	"FromDate": "2016-05-22T00:00:00+03:00",
	"ToDate": "2016-05-30T00:00:00+03:00"
}]
```