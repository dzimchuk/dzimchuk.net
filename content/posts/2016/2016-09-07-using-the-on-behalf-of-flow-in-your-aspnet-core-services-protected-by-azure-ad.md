---
title: Using the on-behalf-of flow in your ASP.NET Core services protected by Azure AD
date: 2016-09-07 20:25:00
permalink: using-the-on-behalf-of-flow-in-your-aspnet-core-services-protected-by-azure-ad
excerpt: We've seen how various OAuth2 flows allow clients to get delegated access to resources on behalf of the users who own the resources. Modern software is built more and more with distributed architecture in mind and service to service communication is a common scenario and when it comes to security...
uuid: 68e5de19-b142-466f-83f7-e31b4c8a9943
tags: Azure Active Directory, ASP.NET
---

We've seen how various OAuth2 flows allow clients to get delegated access to resources on behalf of the users who own the resources. Modern software is built more and more with distributed architecture in mind and service to service communication is a common scenario and when it comes to security we want to know our options.

OAuth2 already describes one flow specifically dedicated to service to service scenarios called [Client Credentials Grant](https://tools.ietf.org/html/rfc6749#page-40) that boils down to the following: the client (a calling service) sends its credentials to the token endpoint of the identity providers (authority) and receives a token back that it includes with a call to a target service. Pretty straightforward and there are a lot of uses for it. However, it has one drawback - we lose the security context in which the calling service was invoked originally.

Well, in many cases this may not be an issue at all. For instance, internal tasks processing data, calculating stats, etc. that should not be bound to the security context of a particular user. But there are other tasks that result in data changes triggered by someone's deliberate action or maybe report generation tasks where we often want to apply security constraints to guarantee that the data gets modified or exposed within the allowed policy. In other words, we would like to preserve the security context of the caller who initiated the operation.

This is where the on-behalf-of flow defined by the [OAuth2 Token Exchange](https://tools.ietf.org/html/draft-ietf-oauth-token-exchange-02) extensions can be really handy.

![On-behalf-Of flow](https://blogcontent.azureedge.net/OnBehalfOf.png)

Service A accepts an access token obtained as a result of some OAuth2 or OpenID Connect dance on the web client and uses it as a user assertion when it makes a call to the authority (in our case Azure AD) to obtain its own access token (*) for the downstream service B. This new access token will carry the same security context as the original one but it will be issued specifically for Service A to call service B.

I've created an ASP.NET Core [test solution](https://github.com/dzimchuk/azure-ad-on-behalf-of-flow) that reproduces the scenario described on the diagram. Please check it out on your own and I will just highlight the important bits related to the on-behalf-of flow.

## Authentication middleware configuration

I won't touch the web client, it uses the OpenID Connect middleware and you can read lots of details about how to configure it for example [here](/post/accessing-azure-ad-protected-resources-using-openid-connect). Service A is our focal point today. It has a pretty standard configuration of the JWT bearer middleware:

```
app.UseJwtBearerAuthentication(new JwtBearerOptions
{
    AutomaticAuthenticate = true,
    AutomaticChallenge = true,

    Authority = authOptions.Value.Authority,
    Audience = authOptions.Value.Audience,

    SaveToken = true,
    
    Events = new JwtBearerEvents
    {
        OnAuthenticationFailed = ctx =>
        {
            ctx.SkipToNextMiddleware();
            return Task.FromResult(0);
        }
    }
});
```

The important property that we should pay attention to is `SaveToken` that allows us to save the original access token in the `AuthenticationProperties` so we can re-use it later as a user assertion.

The proxy code that calls the downstream Service B relies on [ADAL](https://github.com/AzureAD/azure-activedirectory-library-for-dotnet) to request a new access token from Azure AD:

```
public async Task<ClaimSet> GetClaimSetAsync()
{
    var client = new HttpClient { BaseAddress = new Uri(serviceOptions.BaseUrl, UriKind.Absolute) };
    client.DefaultRequestHeaders.Authorization =
        new AuthenticationHeaderValue("Bearer", await GetAccessTokenAsync());

    var payload = await client.GetStringAsync("api/claims");
    return JsonConvert.DeserializeObject<ClaimSet>(payload);
}

private async Task<string> GetAccessTokenAsync()
{
    var credential = new ClientCredential(authOptions.ClientId, authOptions.ClientSecret);
    var authenticationContext = new AuthenticationContext(authOptions.Authority);

    var originalToken = await httpContextAccessor.HttpContext.Authentication.GetTokenAsync("access_token");
    var userName = httpContextAccessor.HttpContext.User.FindFirst(ClaimTypes.Upn)?.Value ??
        httpContextAccessor.HttpContext.User.FindFirst(ClaimTypes.Name)?.Value;

    var userAssertion = new UserAssertion(originalToken, 
        "urn:ietf:params:oauth:grant-type:jwt-bearer", userName);

    var result = await authenticationContext.AcquireTokenAsync(serviceOptions.Resource,
        credential, userAssertion);

    return result.AccessToken;
}
```

Notice the `urn:ietf:params:oauth:grant-type:jwt-bearer` assertion type and the way we get the original token using the `AuthenticationManager`. We use `IHttpContextAccessor` to get access to `HttpContext` in ASP.NET Core (there is not static `Current` property anymore) and we access the `AuthenticationManager` from the context.

In order to be able to inject `IHttpContextAccessor` make sure to register it with the DI container:

```
services.AddSingleton<IHttpContextAccessor, HttpContextAccessor>();
```

## Setting delegated permission in Azure AD

The on-behalf-of flow is supported by v1 endpoints in Azure AD at the time of writing. On the classic portal we need to configure the delegated permission both on the web app to access Service A:

![Granting web application delegated access to Service A](https://blogcontent.azureedge.net/azuread-servicea.png)

As well as on Service A to access Service B:

![Granting Service A delegated access to Service B](https://blogcontent.azureedge.net/azuread-serviceb.png)

By default all applications in Azure AD has a 'user_impersonation' delegated permission (defined in their manifests) that can be assigned to other applications. You can define your own permission, of course.

## Calling the token endpoint

Let's have a closer look at the actual call to the token endpoint.

```
POST https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0/oauth2/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

resource=https://devunleashed.onmicrosoft.com/TestServiceB
&client_id=b13f8976-d003-4478-b9d2-a9ff0ee8b382
&client_secret=<ServiceA client secret>
&grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
&assertion=<original access token>
&requested_token_use=on_behalf_of
&scope=openid
```

The original access token claims:

```
{
	"aud": "https://devunleashed.onmicrosoft.com/TestServiceA",
	"iss": "https://sts.windows.net/70005c1f-ea47-488e-8f57-c3543485f1d0/",
	"iat": 1471948858,
	"nbf": 1471948858,
	"exp": 1471952758,
	"acr": "1",
	"amr": ["pwd"],
	"appid": "ffb2de30-44ee-4e4b-92a0-9ad0d841c03f",
	"appidacr": "1",
	"e_exp": 10800,
	"ipaddr": "37.44.92.69",
	"name": "New Fella",
	"oid": "3ea83d38-dad6-4576-9701-9f0e153c32b5",
	"scp": "user_impersonation",
	"sub": "Pb4IS12ipzA4hH7qswpepAQrOTj7CB5BKFoIvejgEmQ",
	"tid": "70005c1f-ea47-488e-8f57-c3543485f1d0",
	"unique_name": "newfella@devunleashed.onmicrosoft.com",
	"upn": "newfella@devunleashed.onmicrosoft.com",
	"ver": "1.0"
}
```

Notice the value of the `aud` claim. It indicates the target audience of the original token. `appid` claim contains the value of the client ID of the web application.

Now here's the response from the token endpoint:

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
	"token_type": "Bearer",
	"scope": "user_impersonation",
	"expires_in": "3886",
	"ext_expires_in": "11086",
	"expires_on": "1471953058",
	"not_before": "1471948871",
	"resource": "https://devunleashed.onmicrosoft.com/TestServiceB",
	"access_token": "<token value>",
	"refresh_token": "<token value>",
	"id_token": "<token value>"
}
```

`user_impersonation` corresponds to the delegated permission that we granted on the portal. If we look inside the new access token:

```
{
	"aud": "https://devunleashed.onmicrosoft.com/TestServiceB",
	"iss": "https://sts.windows.net/70005c1f-ea47-488e-8f57-c3543485f1d0/",
	"iat": 1471948871,
	"nbf": 1471948871,
	"exp": 1471953058,
	"acr": "1",
	"amr": ["pwd"],
	"appid": "b13f8976-d003-4478-b9d2-a9ff0ee8b382",
	"appidacr": "1",
	"e_exp": 11086,
	"ipaddr": "37.44.92.69",
	"name": "New Fella",
	"oid": "3ea83d38-dad6-4576-9701-9f0e153c32b5",
	"scp": "user_impersonation",
	"sub": "8s5_qJg4r0APO1EdJ3eJlSZkR58qJi-5wv6DMtXs04Y",
	"tid": "70005c1f-ea47-488e-8f57-c3543485f1d0",
	"unique_name": "newfella@devunleashed.onmicrosoft.com",
	"upn": "newfella@devunleashed.onmicrosoft.com",
	"ver": "1.0"
}
```

We see that the `aud` and `appid` claim values have changed. 'b13f8976-d003-4478-b9d2-a9ff0ee8b382' is the client ID of Service A.