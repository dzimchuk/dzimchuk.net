---
title: ADAL distributed token cache in ASP.NET Core
date: 2017-02-14 15:54:00
permalink: adal-distributed-token-cache-in-asp-net-core
excerpt: Azure AD Authentication Library relies on its token cache for efficient token management. When you request an access token with AcquireTokenSilentAsync and there is a valid token in the cache you get it right away. Otherwise if there is a refresh token it's used to obtain a new access token...
uuid: 7f933385-baee-42d5-a031-cefa740b2098
tags: Azure Active Directory, ASP.NET
---

Azure AD Authentication Library ([ADAL](https://docs.microsoft.com/en-us/azure/active-directory/develop/active-directory-authentication-libraries)) relies on its token cache for efficient token management. When you request an access token with `AcquireTokenSilentAsync` and there is a valid token in the cache you get it right away. Otherwise if there is a refresh token it's used to obtain a new access token from Azure AD. The new token is then written into the cache and returned to you.

The library itself supports all kinds of scenarios: from mobile and JavaScript clients to server side applications. It can be used to store tokens for a single user as well as for many users. If you look at the token cache key [class](https://github.com/AzureAD/azure-activedirectory-library-for-dotnet/blob/dev/src/ADAL.PCL/TokenCacheKey.cs) you can see that tokens can be stored and queried by target resources and authorities in addition to clients (applications) and users.

You don't directly work with the cache key and the underlying dictionary. Instead, you properly construct the `AuthenticationContext` and pass other parameters such as client credentials, user and/or resource identifiers to various `AcquireToken*` methods.

By default, there is an in memory singleton cache which is good for quick testing but it doesn't work in real life scenarios. First, tokens have their lifetime and if your application gets restarted you lose them and the user will have to re-authenticate against Azure AD. Second, when you scale out you need to make the cache available to all instances of your application.

The way the cache supports external storage basically boils down to the following. You derive from `TokenCache` and provide handlers for `BeforeAccess` and `AfterAccess` events. These are not even events technically, you just provide a couple of delegates. `BeforeAccess` gets called every time ADAL wants to access the cache and this is where you get a chance to populate the cache from your external storage. `AfterAccess` is called at the end of `AcquireToken*` methods and you want to persist the cache if it has been modified which you can tell by examining the `HasStateChanged` property. Pretty straight forward.

Now, when you load or persist the cache, that includes the whole dictionary, not just individual items. You are provided with convenient `Serialize` and `Deserialize` methods so you don't have to worry about they structure of keys and values. Instead, you just persist byte arrays.

That means, in server side web applications you want to manage the cache by users.

You can choose whatever the external storage and data access technology. In ASP.NET Core it makes a whole bunch of sense to make use of `IDistributedCache` as you get [SQL Server](https://www.nuget.org/packages/Microsoft.Extensions.Caching.SqlServer/) and [Redis](https://www.nuget.org/packages/Microsoft.Extensions.Caching.Redis/) support out of the box.

Before we move to the implementation let's have a look at how the cache is normally going to be used in web applications. Let's say we do the authorization code grant and redeem the code like this:

```
public void Configure(IApplicationBuilder app, 
    IOptions<AuthOptions> authOptions, IDistributedCache distributedCache)
{
    app.UseOpenIdConnectAuthentication(new OpenIdConnectOptions
    {
        ...

        Events = new OpenIdConnectEvents
        {
            OnAuthorizationCodeReceived = async context =>
            {
                var userId = context.Ticket.Principal.FindFirst(AuthConstants.ObjectId).Value;
    
                var clientCredential = new ClientCredential(authOptions.Value.ClientId, authOptions.Value.ClientSecret);
                var authenticationContext = new AuthenticationContext(authOptions.Value.Authority, 
                    new DistributedTokenCache(distributedCache, userId));
                
                await authenticationContext.AcquireTokenByAuthorizationCodeAsync(context.TokenEndpointRequest.Code,
                    new Uri(context.TokenEndpointRequest.RedirectUri, UriKind.RelativeOrAbsolute), 
                    clientCredential, authOptions.Value.ApiResource);
    
                context.HandleCodeRedemption();
            }
        }
    });
}
```

We pass a new instance of our `DistributedTokenCache` to the `AuthenticationContext` and we bind to the signed in user. We can get the unique identifier of the user from the `http://schemas.microsoft.com/identity/claims/objectidentifier` claim that we get in the ID token from Azure AD.

When it's time to call a protected API we request an access from ADAL. You may want to write something like a token provider component like this:

```
internal class AccessTokenProvider : IAccessTokenProvider
{
    private readonly AuthOptions authOptions;
    private readonly IHttpContextAccessor httpContextAccessor;
    private readonly IDistributedCache distributedCache;

    public AccessTokenProvider(IOptions<AuthOptions> authOptions, 
        IHttpContextAccessor httpContextAccessor, 
        IDistributedCache distributedCache)
    {
        this.authOptions = authOptions.Value;
        this.httpContextAccessor = httpContextAccessor;
        this.distributedCache = distributedCache;
    }

    public async Task<string> AcquireTokenAsync(string resource)
    {
        var userId = httpContextAccessor.HttpContext.User.FindFirst(AuthConstants.ObjectId).Value;

        var clientCredential = new ClientCredential(authOptions.ClientId, authOptions.ClientSecret);
        var authenticationContext = new AuthenticationContext(authOptions.Authority, 
            new DistributedTokenCache(distributedCache, userId));

        try
        {
            var authenticationResult = await authenticationContext.AcquireTokenSilentAsync(resource,
                clientCredential, new UserIdentifier(userId, UserIdentifierType.UniqueId));

            return authenticationResult.AccessToken;
        }
        catch (AdalSilentTokenAcquisitionException ex)
        {
            // handle it
            return null;
        }
    }
}
```

Again, we pass a fresh instance of the cache to the `AuthenticationContext`. You may find other examples of the token cache implementation on the internet and often they sort of assume that the cache instance is re-used but my implementation is based on the assumption that you create a new instance every time you need it which makes sense in stateless web applications.

With all of the above, let's get down to implementing our distributed token cache.

```
internal class DistributedTokenCache : TokenCache
{
    private readonly IDistributedCache cache;
    private readonly string userId;

    public DistributedTokenCache(IDistributedCache cache, string userId)
    {
        this.cache = cache;
        this.userId = userId;

        BeforeAccess = OnBeforeAccess;
        AfterAccess = OnAfterAccess;
    }

    private void OnBeforeAccess(TokenCacheNotificationArgs args)
    {
        var userTokenCachePayload = cache.Get(CacheKey);
        if (userTokenCachePayload != null)
        {
            Deserialize(userTokenCachePayload);
        }
    }

    private void OnAfterAccess(TokenCacheNotificationArgs args)
    {
        if (HasStateChanged)
        {
            var cacheOptions = new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromDays(14)
            };

            cache.Set(CacheKey, Serialize(), cacheOptions);

            HasStateChanged = false;
        }
    }

    private string CacheKey => $"TokenCache_{userId}";
}
```

Pretty straight forward. We set the expiration to 14 days which is the default life time of refresh tokens issued by Azure AD. But be aware that it may not always be the case.

Sometimes you can see examples that also override `Clear` and `DeleteItem` methods but it's not required in our case. We always get the `AfterAccess` notification when those methods finish and as our cache is scoped to a single user we want to make sure to persist the whole thing if it has been changed.