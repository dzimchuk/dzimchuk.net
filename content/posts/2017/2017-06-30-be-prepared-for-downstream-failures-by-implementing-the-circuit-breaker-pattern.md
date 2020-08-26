---
title: Be prepared for downstream failures by implementing the Circuit Breaker pattern
date: 2017-06-30 10:29:45
permalink: be-prepared-for-downstream-failures-by-implementing-the-circuit-breaker-pattern
excerpt: When building distributed applications we need to make sure that when we talk to a remote services or our microservices talk to each other we can handle downstream call failures and either recover automatically or gracefully degrade our own service instead of failing outright.
uuid: fa59b81f-ac3b-4b14-8214-a4ce784ed06a
tags: Cloud Patterns
---

When building distributed applications we need to make sure that when we talk to a remote services or our microservices talk to each other we can handle downstream call failures and either recover automatically or gracefully degrade our own service instead of failing outright.

There are two types of downstream failures. Those that are transient in nature (such as network glitches) and auto correct themselves. We've learned to tackle them with the [Retry](/make-sure-to-implement-transient-fault-handling-when-running-in-the-cloud/) strategy. The other type is long lasting failures when we can tell that a remote service is experiencing problems that are not likely to go away fast enough. We want to give the failing service a break by not sending requests to it for a certain period of time and at the same time we want to continue functioning by falling back to caches or alternate data source or even degrading our functionality. This is achieved by implementing the [Circuit Breaker](https://docs.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker) pattern.

It's important to be able to recognize the second type of failures. These are normally 50x responses but it can also be for instance HTTP 429 (Too Many Requests) when the remote service is throttling clients.

## Closed -> Open -> Half-Open

The circuit breaker is essentially a state machine that acts like a proxy between your application and a remote service.

Normally it's in the closed state meaning that requests flow from your application to the remote service. Behind the scenes there is an additional error handling layer that keeps track of a number of failures that occurred calling the remote services. When this number exceeds a predefined threshold within the specified timeframe the circuit breaker switches to the open state. The logic can be more sophisticated, for example, we may want to track percentage of failures within certain timeframes and set minimum throughput for the circuit to react.

When switching to the open state the circuit breaker needs to make the application aware of the switch. Unlike the retry strategy that swallows errors the circuit breaker either raises events or captures errors into custom exception types that can be properly handled by the upstream components. The idea is to allow the application to properly adjust its behavior when the long lasting issue with the remote service has been detected.

In the open state the circuit breaker prevents calls to the remote service by returning immediately with the same well known exception type so that the application keeps functioning in the restricted mode. While in the open state the circuit breaker uses a timer to control its cool down period. When the cool down period expires the circuit breaker enters a half-open state.

In the half-open state the circuit breaker starts letting a limited number of requests through again. If these trial requests succeed then the remote service is deemed repaired and the circuit is switched to the closed state. If they fail then the circuit is back to the half-open state and the timer is reset.

## Implementing the Circuit Breaker

We can implement a circuit breaker using [State](https://en.wikipedia.org/wiki/State_pattern) pattern however it might be a better idea to look for options already available. For .NET the most known one is probably [Polly](https://github.com/App-vNext/Polly). In fact, Polly is a really useful library that besides the Circuit Breaker gives you implementations of Retry, Fallback, Timeout, Cache-Aside and other patterns. You can even combine multiple patterns such as Retry and Circuit Breaker using its `PolicyWrap` policy.

Let's have a quick look how you can use to implement a circuit breaker around your data access components. We're going to use BookFast [BookingProxy](https://github.com/dzimchuk/book-fast-service-fabric/blob/master/BookFast.Web.Proxy/BookingProxy.cs) as an example. First, let's create a decorator for it:

```
internal class CircuitBreakingBookingProxy : IBookingService
{
    private readonly IBookingService innerProxy;
    private readonly CircuitBreakerPolicy breaker =
            Policy.Handle<HttpOperationException>(ex => ex.StatusCode() >= 500 || ex.StatusCode() == 429)
            .CircuitBreakerAsync(
                exceptionsAllowedBeforeBreaking: 2,
                durationOfBreak: TimeSpan.FromMinutes(1));

    public CircuitBreakingBookingProxy(IBookingService innerProxy)
    {
        this.innerProxy = innerProxy;
    }
    
    public async Task<List<Booking>> ListPendingAsync()
    {
        try
        {
            return await breaker.ExecuteAsync(() => innerProxy.ListPendingAsync());
        }
        catch (HttpOperationException ex)
        {
            throw new RemoteServiceFailedException(ex.StatusCode(), ex);
        }
        catch (BrokenCircuitException ex)
        {
            throw new RemoteServiceFailedException(ex.StatusCode(), ex);
        }
    }
}
```

We instantiate a simple circuit breaker policy that is going to handle `HttpOperationException` from [AutoRest](https://github.com/Azure/AutoRest) generated proxy classes. We need to make sure to properly identify remote errors in your circuit breakers. In this case we're going handle all 50x and 429 errors. Our simple policy will break the circuit on 2 *consecutive* errors. There is a more [advanced](https://github.com/App-vNext/Polly/wiki/Advanced-Circuit-Breaker) policy provided by Polly that allows you to specify percentage of g failures within set timeframes and also the minimum throughput value so the policy kicks in only when there is statistically significant number of calls, e.g.:

```
Policy
   .Handle<TException>(...)
   .AdvancedCircuitBreaker(
        failureThreshold: 0.5,
        samplingDuration: TimeSpan.FromSeconds(5),
        minimumThroughput: 20, 
        durationOfBreak: TimeSpan.FromSeconds(30))
```

We need to make sure to register the circuit breaker as a singleton as it keeps state across requests:

```
services.AddSingleton<BookingProxy>();
services.AddSingleton<IBookingService, CircuitBreakingBookingProxy>(serviceProvider =>
    new CircuitBreakingBookingProxy(serviceProvider.GetService<BookingProxy>()));
```

Full implementation of the circuit breaker decorator is available [here](https://github.com/dzimchuk/book-fast-service-fabric/blob/master/BookFast.Web.Proxy/CircuitBreakingBookingProxy.cs).

![Circuit Breaker error stack trace](https://blogcontent.azureedge.net/2017/06/circuit_breaker_stack_trace.png)

When the circuit breaker is in the open state Polly will throw `BrokenCircuitException` immediately. In our case we translate both `HttpOperationException` and `BrokenCircuitException` to our custom exception type `RemoteServiceFailedException` that can be propagated higher up to business components.