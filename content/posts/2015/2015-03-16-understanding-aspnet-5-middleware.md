---
title: Understanding ASP.NET 5 middleware
date: 2015-03-16T17:01:00.000Z
lastmod: 2017-09-09T11:20:02.000Z
permalink: understanding-aspnet-5-middleware
excerpt: Principals and design approaches that we have seen in OWIN specification and some of its implementations (for Microsoft servers and frameworks the most notable is Katana) found their way into ASP.NET 5. In this post I want to focus on one of the core concepts which is middleware.
uuid: f03b474e-e617-4d8a-8fc8-d2df5eb41168
tags: ASP.NET
---

Principals and design approaches that we have seen in [OWIN specification](http://owin.org/spec/spec/owin-1.0.0.html) and some of its implementations (for Microsoft servers and frameworks the most notable is [Katana](http://katanaproject.codeplex.com/)) found their way into [ASP.NET 5](https://github.com/aspnet/). Decoupling servers and applications, application delegates, environment state all are features that can be found in ASP.NET 5 and it also brings a lot more to the table.

In this post I want to focus on one of the core concepts which is middleware. OWIN specification defines it as:

> Middleware – Pass through components that form a pipeline between a server and application to inspect, route, or modify request and response messages for a specific purpose.

And this definition applies to ASP.NET 5 as well. Middleware can be thought of as both HTTP modules and handlers that we've had in classic ASP.NET. Some middleware would implement various intermediate tasks when processing requests such as authentication, session state retrieval and persistence, logging and so on. Some of them would be the ultimate request handlers that would produce responses.

## Request delegate

Let's create a sample application and write some middleware. When you create an empty ASP.NET 5 web application it contains literally nothing but a `Startup` class with an empty `Configure` method. It should ring the bell for those who have worked with OWIN. Let's add a very simple middleware that will handle any request and produce a text response:

```
public class Startup
{
    public void Configure(IApplicationBuilder app)
    {
        app.Run(async context =>
        {
            context.Response.ContentType = "text/plain";
            await context.Response.WriteAsync("Hello ASP.NET 5!");
        });
    }
}

```

We have just used the simplest overload of the `Run` method that accepts a `RequestDelegate`.

```
public delegate Task RequestDelegate(HttpContext context);

```

`RequestDelegate` is an equivalent of OWIN's AppFunc. It accepts a state (`HttpContext`) and returns a promise (`Task`). A caller can await for your middleware to complete doing its job by waiting on the task. Note that it's not SystemWeb's `HTTPContext` that's tied to IIS. It's the new server agnostic context that encapsulates request processing state.

There are more overloads for the `Run` method to support dependency injection which is another hot topic in ASP.NET 5 but for now it is important to understand `RequestDelegate` and its role. `RequestDelegate` is also used to chain middleware in a pipeline:

```
public class Startup
{
    public void Configure(IApplicationBuilder app)
    {
        app.Use(next => async context =>
        {
            // do your stuff here before calling the next middleware 
            // in the pipeline

            await next.Invoke(context); // call the next guy

            // do some more stuff here as the call is unwinding
        });

        app.Run(async context =>
        {
            context.Response.ContentType = "text/plain";
            await context.Response.WriteAsync("Hello ASP.NET 5!");
        });
    }
}

```

Asynchronous lambda that is passed to the `Use` method may seem fuzzy at first but it is essentially a function that accepts a `RequestDelegate` for _next_ middleware in the pipeline and returns a `RequestDelegate` for current middleware:

```
IApplicationBuilder Use(Func<RequestDelegate, RequestDelegate> middleware);

```

## Middleware as a standalone class

In most cases you are going to be writing your middleware as standalone classes instead of defining them inline with lambdas. This way you can distribute your middleware components in standalone packages and it also makes them testable. Let’s write a sample middleware that will perform [HTTP Basic authentication](http://en.wikipedia.org/wiki/Basic_access_authentication).

```
public class BasicAuthentication
{
    private readonly RequestDelegate next;

    public BasicAuthentication(RequestDelegate next)
    {
        this.next = next;
    }

    public async Task Invoke(HttpContext context, 
                             IAuthenticationService authenticationService)
    {
        try
        {
            var parser = new BasicAuthenticationParser(context);
            var username = parser.GetUsername();
            var password = parser.GetPassword();

            await authenticationService.AuthenticateAsync(username, password);
            await next(context);
        }
        catch (InvalidCredentialsException)
        {
            context.Response.StatusCode = 401;
            context.Response.Headers.Add("WWW-Authenticate", 
                new[] { "Basic" });
        }
    }
}

```

There is no special class or interface that you have to inherit from or implement in order to create your middleware. However, there is some convention. Your middleware component should accept a `RequestDelegate` for the next middleware in the pipeline in its constructor. The `Invoke` method will be called by the infrastructure and this is where your component performs its task. This method’s signature can correspond to `RequestDelegate` or it can also accept additional dependencies along with `HttpContext`. The dependencies will be satisfied by ASP.NET dependency injection mechanism given that they have been properly registered.

Your component should invoke the delegate to pass control to the next middleware or it may choose to circuit break out of further processing of the request by not calling the next component in the pipeline. This is exactly what our `BasicAuthentication` middleware does when it either can’t find valid Authorization header in the request or provided credentials are not valid.

## Registering standalone middleware components with pipeline

It is a good practice to provide a convenient extension method for `IApplicationBuilder` to register your middleware components. For our `BasicAuthentication` component we can include the following class:

```
public static class BasicAuthenticationExtensions
{
    public static void UseBasicAuthentication(this IApplicationBuilder builder)
    {
        builder.UseMiddleware<BasicAuthentication>();
    }
}

```

Note that `UseMiddleware` extension method itself is defined in Microsoft.AspNet.Http.Extensions package. This package in turn is a dependency for Microsoft.AspNet.RequestContainer that we are going to be adding shortly. So it's enough to add the latter.

Now we can add our `BasicAuthentication` middleware to the pipeline like this:

```
public class Startup
{
    public void Configure(IApplicationBuilder app)
    {
        app.UseBasicAuthentication();

        app.Run(async context =>
        {
            context.Response.ContentType = "text/plain";
            await context.Response.WriteAsync("Hello ASP.NET 5!");
        });
    }
}

```

## Configuring dependencies

As our middleware component depends on `IAuthenticationService` to actually validate username and password we need to register an implementation of the service with ASP.NET. To start taking advantage of ASP.NET built-in dependency injection abstraction we need to add the following nuget package: Microsoft.AspNet.RequestContainer. We can do that by adding the dependency to project.json:

```
"dependencies": {
    "Microsoft.AspNet.Server.IIS": "1.0.0-beta2",
    "Microsoft.AspNet.RequestContainer": "1.0.0-beta2"
}
```

Now we can use either `IApplicationBuilder.UseService` extension method or we can add `ConfigureServices` method to the `Startup` class. Both methods accept a service collection object as a parameter and we can register services as either transient, scoped to request or singletons.

```
public class Startup
{
    public void Configure(IApplicationBuilder app)
    {
        ...
    }

    public void ConfigureServices(IServiceCollection services)
    {
        services.AddTransient<IAuthenticationService, SimpleAuthenticationService>();
    }
}

```

For demo purposes implementation of `SimpleAuthenticationService` will match its name and be as simple as that:

```
internal class SimpleAuthenticationService : IAuthenticationService
{
    public Task AuthenticateAsync(string username, string password)
    {
        if ("testuser".Equals(username, StringComparison.OrdinalIgnoreCase) &&
            "testpwd".Equals(password))
        {
            return Task.FromResult(0);
        }

        throw new InvalidCredentialsException();
    }
}
```

To complete our solution we need a parser that would try to extract username and password from Authorization HTTP header:

```
internal class BasicAuthenticationParser
{
    private readonly string credentials;

    public BasicAuthenticationParser(HttpContext context)
    {
        credentials = GetCredentials(context);
    }

    public string GetUsername()
    {
        return GetValue(credentials, 0);
    }

    public string GetPassword()
    {
        return GetValue(credentials, 1);
    }

    private static string GetValue(string credentials, int index)
    {
        if (string.IsNullOrWhiteSpace(credentials))
            return null;

        var parts = credentials.Split(':');
        return parts.Length == 2 ? parts[index] : null;
    }

    private static string GetCredentials(HttpContext context)
    {
        try
        {
            string[] authHeader;
            if (context.Request.Headers.TryGetValue("Authorization", out authHeader) &&
                authHeader.Any() &&
                authHeader[0].StartsWith("Basic "))
            {
                var value = Convert.FromBase64String(authHeader[0].Split(' ')[1]);
                return Encoding.UTF8.GetString(value);
            }

            return null;
        }
        catch
        {
            return null;
        }
    }
}
```

## Testing BasicAuthentication middleware

We are ready to test our middleware. When we hit F5 the browser displays a regular credentials dialog when trying to display a page. Let’s open browser development tools or fire up Fiddler and examine responses that we get from our application.

When making a request without Authorization header we get the expected 401 response:

```
GET http://localhost:5400/ HTTP/1.1

HTTP/1.1 401 Unauthorized
Server: Microsoft-IIS/10.0
WWW-Authenticate: Basic
Content-Length: 0

```

If we include Authorization header with correct authentication scheme and credentials (you can use an [online tool](https://www.base64decode.org/) to Base64 encode credentials) we get successful response from our application:

```
GET http://localhost:5400/ HTTP/1.1
Authorization: Basic dGVzdHVzZXI6dGVzdHB3ZA==

HTTP/1.1 200 OK
Server: Microsoft-IIS/10.0
Content-Length: 16

Hello ASP.NET 5!

```