---
title: Application request routing in Azure Web Apps
date: 2016-03-01T15:24:03.000Z
lastmod: 2018-03-18T15:04:15.000Z
permalink: application-request-routing-in-azure-web-apps
excerpt: Azure Web Apps by default enable so-called sticky sessions when subsequent requests that are made within an established session get processed by the same instance of an app that served the very first request of the session. Web Apps rely on the IIS extension called Application Request Routing...
uuid: 3e863dc5-db69-457f-83f6-7569e4af80fb
tags: Azure App Services, Azure Services
---

Azure Web Apps by default enable so-called sticky sessions when subsequent requests that are made within an established session get processed by the same instance of an app that served the very first request of the session.

Web Apps rely on the IIS extension called [Application Request Routing](http://www.iis.net/learn/extensions/planning-for-arr) (ARR) to implement that and the idea is basically to add a cookie with a server instance identifier upon the first response so that subsequent requests include the cookie and thus can indicate to ARR which server instance to route them to.

The feature is very useful when a lot of session state is loaded into memory and moving it to a distributed store is too expensive. It's also useful in scenarios when you need to quickly deploy your existing apps to Azure with little to none changes in code and/or configuration.

However if you've built your app to be stateless ARR actually limits scalability of your system. Another thing to be aware of are long sessions. Think about a user who's got a tab with your app open for a long time and when he makes another request the instance that used to serve his session has long died.

## ARR in action

Let's see how ARR works by deploying a sample application to an Azure Web App running with 2 instances. We're going to use a well known [MusicStore](https://github.com/aspnet/MusicStore) sample that allows users to buys music. Although it persists shopping carts in the database it uses in-memory session to store shopping cart identifiers. This is exactly the scenario that ARR is supposed to help with when deploying this kind of apps to web farms without making any design or code changes.

But we will make a little change for our testing purposes. We're going make the app include a custom header in each response containing an ID of the Azure Web App instance serving the request:

```
app.Use(next => async context =>
{
    context.Response.OnStarting(state =>
    {
        var ctx = (HttpContext)state;
        ctx.Response.Headers.Add("X-Instance-Id", Configuration["WEBSITE_INSTANCE_ID"]);

        return Task.FromResult(0);
    }, context);
    await next(context);
});
```

Now that we have a test app let's create a [JMeter](http://jmeter.apache.org/) script (test plan) that would emulate a user's activity of selecting a genre and adding a few albums from that genre to his shopping cart.

![JMeter test plan](https://blogcontent.azureedge.net/7418b978-7717-41e9-9fca-1e2a8253549a.png)

I used JMeter's capability to record web tests. Once the basic scenario has been recorded you normally clean up the calls you are not interested in and add post request processors and controllers to fully implement the behavior that you need. You can download the completed test plan from [here](https://blogcontent.azureedge.net/2016/03/MusicStore.jmx).

On step 1 the user navigates to `/Store/Browse` path and passes `?Genre=Rock` query string parameter. The CSS extractor locates URLs to each album on the page and saves them in JMeter variables that will be used by the ForEach controller on step 2\. For the first 10 albums the ForEach controller first opens an album's page and then adds the album to the shopping cart. In the end we open the cart and verify that total sum is $89.90.

Let's set the number of simultaneous users (threads) to 2 and ramp-up period to 0 or 1 second:

```
Thread 1:

Response headers:
HTTP/1.1 200 OK
Cache-Control: no-cache
Pragma: no-cache
Transfer-Encoding: chunked
Content-Type: text/html; charset=utf-8
Expires: -1
Vary: Accept-Encoding
Server: Microsoft-IIS/8.0
Set-Cookie: .AspNet.Session=03e33212-4650-93c0-0cc2-d1fa6d4f3a5a; path=/; httponly
X-Instance-Id: 1bcb92fe7c8bb579af8491a8a6da2bb9f589ffa9d2719f4f36a7d13e9b6359f3
X-Powered-By: ASP.NET
Set-Cookie: ARRAffinity=1bcb92fe7c8bb579af8491a8a6da2bb9f589ffa9d2719f4f36a7d13e9b6359f3;Path=/;Domain=musicstore2.azurewebsites.net
Date: Tue, 01 Mar 2016 12:40:26 GMT

Thread 2:

Response headers:
HTTP/1.1 200 OK
Cache-Control: no-cache
Pragma: no-cache
Transfer-Encoding: chunked
Content-Type: text/html; charset=utf-8
Expires: -1
Vary: Accept-Encoding
Server: Microsoft-IIS/8.0
Set-Cookie: .AspNet.Session=4854d1e5-14b8-82c4-d717-84cb954fec4d; path=/; httponly
X-Instance-Id: a58e63fe330ef44eea87d6737206e361d6d9bab12d95c822f301420c3bcf36b9
X-Powered-By: ASP.NET
Set-Cookie: ARRAffinity=a58e63fe330ef44eea87d6737206e361d6d9bab12d95c822f301420c3bcf36b9;Path=/;Domain=musicstore2.azurewebsites.net
Date: Tue, 01 Mar 2016 12:40:27 GMT
```

We can see that requests from each thread were processed by different instances. Upon the first request the server added two cookies: session and ARR affinity that were then resent with each subsequent request. Note that the ARR affinity cookie values are basically the same as instance ID's that we return in our custom `X-Instance-Id` header.

The test succeeded and both shopping carts contained expected number of items.

## Disabling ARR

<span><span>In order to prevent Azure Web Apps from adding the ARR affinity cookie we should add a special custom header to the response:</span></span>

```
Arr-Disable-Session-Affinity: True
```

As MusicStore relies on in-memory session it will immediately break the shopping cart when running in a web farm. Let's demo it! First, let's update our middleware to add the disabling header:

```
app.Use(next => async context =>
{
    context.Response.OnStarting(state =>
    {
        var ctx = (HttpContext)state;
        ctx.Response.Headers.Add("X-Instance-Id", Configuration["WEBSITE_INSTANCE_ID"]);
	ctx.Response.Headers.Add("Arr-Disable-Session-Affinity", "True");

        return Task.FromResult(0);
    }, context);
    await next(context);
});
```

```
Thread 1:

Response headers:
HTTP/1.1 200 OK
Cache-Control: no-cache
Pragma: no-cache
Transfer-Encoding: chunked
Content-Type: text/html; charset=utf-8
Expires: -1
Vary: Accept-Encoding
Server: Microsoft-IIS/8.0
Set-Cookie: .AspNet.Session=632b8f9c-5aa1-e778-26bf-92333aa9fa49; path=/; httponly
X-Instance-Id: 1bcb92fe7c8bb579af8491a8a6da2bb9f589ffa9d2719f4f36a7d13e9b6359f3
Arr-Disable-Session-Affinity: True
X-Powered-By: ASP.NET
Date: Tue, 01 Mar 2016 12:51:10 GMT

Thread 2:

Response headers:
HTTP/1.1 200 OK
Cache-Control: no-cache
Pragma: no-cache
Transfer-Encoding: chunked
Content-Type: text/html; charset=utf-8
Expires: -1
Vary: Accept-Encoding
Server: Microsoft-IIS/8.0
Set-Cookie: .AspNet.Session=e4f22745-8c2a-ac36-f753-3cce9c2e2469; path=/; httponly
X-Instance-Id: a58e63fe330ef44eea87d6737206e361d6d9bab12d95c822f301420c3bcf36b9
Arr-Disable-Session-Affinity: True
X-Powered-By: ASP.NET
Date: Tue, 01 Mar 2016 12:51:48 GMT
```

We can see that again 2 different instances are processing requests from the test threads but there are no ARR affinity cookies any more. As a result subsequent requests get dispatched to different instances and shopping carts get filled up in an ad-hoc manner and of course in the end our test assertions fail.

![JMeter failed assertions](https://blogcontent.azureedge.net/88cf9591-b6f4-4ec7-b1b1-68fe06dbace3.png)

## Distributed session store to the rescue!

As we decided to scale out and disabled sticky sessions for potentially more efficient throughput we need to switch from memory to a distributed store for our session. It's pretty easy to achieve in ASP.NET Core as the session service relies on `IDistributedCache` implementation. The default one is a local cache that gets configured when you enable cache and session support in `Startup.cs`:

```
public void ConfigureServices(IServiceCollection services)
{
    services.AddCaching();

    services.AddSession();
}
```

However there are packages that provide SQL Server and Redis implementations of `IDistributedCache`. Let's add the Redis one to the application:

```
"dependencies": {
  "Microsoft.Extensions.Caching.Redis": "1.0.0-rc1-final"
}
```

Now let's remove `services.AddCaching()` and configure the pipeline to use Redis cache instead:

```
public void ConfigureServices(IServiceCollection services)
{
    services.AddRedisCache();
    services.Configure<RedisCacheOptions>(Configuration.GetSection("Redis"));

    services.AddSession();
}
```

For this to work we also need to add a 'Redis' section to the configuration with a property called 'Configuration' as defined in RedisCacheOptions but because the property contains a connection string to the Redis instance we should instead add an environment variable to the Web App (or a user secret when running locally):

```
Redis:Configuration = <InstanceName>.redis.cache.windows.net,abortConnect=false,ssl=true,password=...
```

Once we have redeployed and re-run our test we can see that requests are still processed by different servers within the same session but the final shopping carts contain expected items.