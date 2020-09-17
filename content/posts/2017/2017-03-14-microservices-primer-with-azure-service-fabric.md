---
title: Microservices primer with Azure Service Fabric
date: 2017-03-14T15:40:00.000Z
lastmod: 2017-09-06T04:37:53.000Z
permalink: microservices-primer-with-azure-service-fabric
excerpt: Not so long ago I've written a post about motivation for transforming traditional monolithic architectures into microservices. I've touched upon key characteristics of microservices and things to look out for when building them. Today I want to do a more hands-on post...
uuid: 891f1d6a-a9a5-471b-8d43-bd8a11a5fb6a
tags: Azure Service Fabric, Design and Architecture
---

Not so long ago I've written a [post](/splitting-a-monolith-into-microservices/) about motivation for transforming traditional monolithic architectures into microservices. I've touched upon key characteristics of microservices and things to look out for when building them. Today I want to do a more hands-on post on turning an existing application into a microservices application.

## Existing solution

I'm going to use my playground solution called BookFast that I often use to try out things and demonstrate concepts that I write about on this blog.

![Existing BookFast solution](https://blogcontent.azureedge.net/2017/03/BookFast---Monolith.png)

It's an ASP.NET Core application that allows organizations to provide their facilities and accommodations to be booked by customers. The application features [MVC based UI](https://github.com/dzimchuk/book-fast) and provides [RESTful API](https://github.com/dzimchuk/book-fast-api) that enables other clients to communicate with it. It relies on a bunch of Azure services such as SQL databases and storage, Azure AD for organizational accounts and Azure AD B2C for customer authentication, Azure Search, Application Insights, etc.

Although it's split by a pure technical separation of concerns (UI, API, etc) which enables independent scalability of these components, the individual components are essentially monoliths. You can't add or update a feature without redeploying the whole thing, you can't scale features independently, features start having interdependencies which make the solution rigid to change over time.

## Enter microservices

When identifying service boundaries for our future microservices first of all we look at business capabilities provided by the application. In BookFast we can define the following basic scenarios:

1. As a facility provider I need to manage facilities and accommodations provided by my organization.
2. As a facility provider I want to upload and remove images of my facilities and accommodations.
3. As a customer I want to be able to search for accommodations.
4. As a customer I want to be able to book an accommodation.

Besides business services, as we develop our microservices application we naturally start seeing new services with a pure technical purpose such as indexers, synchronizers, registers, etc. But it's important to start with business capabilities.

![BookFast microservices](https://blogcontent.azureedge.net/2017/03/BookFast---SF.png)

With microservices we greatly increase complexity of our system but it should not scare us away because at the same time we solve the most important problem - being able to evolve our system fast in response to the constant stream of changes coming from customers, stakeholders and so on.

We need to think about service deployment, updates, health monitoring, resilience to failures and operating system updates. In other words we need an infrastructure to handle all that and various container orchestration tools deliver this exact functionality. Microsoft has built its own microservices platform called [Service Fabric](https://azure.microsoft.com/en-us/services/service-fabric/) that it uses to run their own production services and has made it available for everyone. You can run Service Fabric cluster in Azure, other cloud or on premises.

Service Fabric gives you programming models on top of cluster management. As we migrate existing applications chances are they have been built stateless which is exactly the case with BookFast. This makes Service Fabric stateless services a perfect fit for us. Service Fabric services (both stateless and tasteful) allow you to open up network listeners as well as run background tasks. This should suffice to cover all of our scenarios.

You can check out a complete re-architectured application [here](https://github.com/dzimchuk/book-fast-service-fabric). In the following sections I'm going to describe the anatomy of a microservice and give some tips on various aspects of their implementation.

## Microservice internals

Do not be misled by the word *micro* - your microservice still deserves a solid architecture with proper layers and dependency discipline. If you look at any of the BookFast microservices you will find that it normally consists of a few projects:

![Microservice projects](https://blogcontent.azureedge.net/2017/03/microservice-projects.png)

There is a host project (e.g. BookFast.Facility) which:

1. Serves as a host for Service Fabric service instances;
2. Implements REST API for the service. So it also serves as a front-end project.

When a service instance is created it is asked to provide a collection of endpoint listeners through overridden `CreateServiceInstanceListeners` methods. Details depend on your stack of choice. BookFast is based on ASP.NET Core and thus we build our `IWebHost` and wrap it with one of the communication listeners provided by Microsoft.ServiceFabric.AspNetCore.Kestrel and Microsoft.ServiceFabric.AspNetCore.WebListener packages. Some services (e.g. search indexer) implement background processing and subscribe to triggers (e.g. a queue) in the overridden `RunAsync` method.

There is a contracts project defining service domain model and business interfaces. These are *not* external contracts but the internal model of the service. There are also business and data projects implementing appropriate layers.

![Microservice components](https://blogcontent.azureedge.net/2017/03/Microservice-components-updated.png)

Services rely on versioned configuration packages and per-environment configuration supported by Service Fabric. I've written a couple of posts on how you can [integrate](/configuring-asp-net-core-applications-in-service-fabric/) configuration packages with ASP.NET Core configuration and how to [override](/using-code-package-environment-variables-in-service-fabric/) code package's environment variables.

## Integration

There are a few patterns for service to service communication:

- Request-response (RPC style or REST)
- Duplex over a persistent connection
- Asynchronous through a broker (e.g. a queue)

BookFast mostly relies on request-response through RESTful services. Even though its APIs provide Swagger documentation and enable consumers (in our case there is a single consumer but anyway) to generate clients for them it's considered a good practice for teams owning microservices to provide client libraries for them, often for various platforms and languages. It makes it easier to use the service and helps insure that the service and client libraries stay in sync as the service evolves.

With microservices managed in a cluster there is one more task to accomplish before we can communicate with a service - discovery. Services can be moved around a cluster in response to node upgrades or failures, resource usage optimization and so on. Even though Service Fabric provides us with a naming service and convenient client side components for service discovery writing this boilerplate code can be rather tedious.

I've given details on implementing a client library for internal communication in Service Fabric in [this post](/implementing-a-rest-client-for-internal-communication-in-service-fabric/). All BookFast services follow this approach.

## Common components

You should be careful with shared or common components as they can easily introduce either coupling between services or dependencies between teams managing different services. Limit them to infrastructural code or cross cutting concerns if you haven't decided to move them to services on their own. Never share business logic. If you find that you need to do so step back and reconsider your use cases and service boundaries. You are likely to discover new services.

There are a handful of infrastructural common components in BookFast:

![Common components](https://blogcontent.azureedge.net/2017/03/microservices-common-components.png)

- BookFast.Framework - defines common infrastructure interfaces such as `ICompositionModule`, etc.
- BookFast.Rest - helps integrate access token retrieval with AutoRest generated clients.
- BookFast.Security - defines application roles and claim types together with `ISecurityContext` interface that allows business services to make appropriate decisions based on the current user or tenant.
- BookFast.Security.AspNetCore - contains ASP.NET Core specific implementation of `ISecurityContext`.
- BookFast.ServiceFabric - implements common configuration and communication infrastructure specific to Service Fabric, it also defines provides service instance and replica factories.
- BookFast.Swagger - implements Swashbuckle configuration.

## Restructuring web applications into features

This is not strictly related to microservices but I would like to talk about the way we organize web applications a little bit and how we can make it better. When you start a new MVC project you are given the familiar Controllers, Views and Models directories. You start adding stuff and end up with a few dozens of controllers sitting in a single directory, hundreds of models often in one or several directories. The framework somewhat helps organize views with default conventions but navigating a relatively complex application stops being fun way too soon.

Effectively we end up with an application with unclear feature boundaries. It may or may not impact maintainability of the application depending on the maturity level of the team and practices that have been followed. But I think if we applied a similar vertical slicing to the web application as we did to the rest of the system with microservices we would end up with a better organized application. Instead of mechanically splitting components based on their purpose we could split them by features. Each feature would have its controllers, models and views.

![Web app features](https://blogcontent.azureedge.net/2017/03/web-app-features.png)

I highly recommend you check out [this article](https://msdn.microsoft.com/en-us/magazine/mt763233.aspx) on the topic. BookFast uses this approach and relies on OdeToCode.AddFeatureFolders package to configure the view engine to support new conventions.