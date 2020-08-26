---
title: WCF error helpers
date: 2014-07-01 16:31:00
permalink: wcf-error-helpers
uuid: f234e41f-b828-44d3-8d85-81e547c2ae78
tags: WCF
---

It's a pretty common requirement to propagate error information from your WCF services to clients. Although it's possible to just let exceptions flow through your code and make WCF wrap them in a fault it is much better from the interoperability perspective to construct and send SOAP faults that you declare in your service definition.

> Prefer fault contracts over letting exceptions be wrapped in a generic fault by the infrastructure.

When constructing a `FaultException<T>` you want to provide a fault code.  If you don't the infrastructure will include the default 'Sender' code. There are two problems:

1.  'Sender' code means the error occurred because the client sent invalid arguments. But errors also occur because of issues that happen on the server. In this case you want a 'Receiver' code.
2.  SOAP 1.1 and 1.2 have different formats of the fault code. In fact, terms 'Sender' and 'Receiver' belong to version 1.2 whereas 1.1 uses 'Client' and 'Server' instead.

The SOAP version depends on the binding configuration that you use. These little helpers are useful when you want to detect the SOAP version at runtime and construct a proper fault code:

```
public static FaultCode CreateSenderFaultCode(string subCode)
{
    var version = 
        OperationContext.Current.IncomingMessageVersion.Envelope;
    if (version == EnvelopeVersion.Soap11)
    {
        return new FaultCode("Client", 
            new FaultCode(string.Format(CultureInfo.InvariantCulture, "Client.{0}", subCode)));
    }
    else
    {
        return FaultCode.CreateSenderFaultCode(
            new FaultCode(subCode));
    }
}

public static FaultCode CreateReceiverFaultCode(string subCode)
{
    var version = 
        OperationContext.Current.IncomingMessageVersion.Envelope;
    if (version == EnvelopeVersion.Soap11)
    {
        return new FaultCode("Server", 
            new FaultCode(string.Format(CultureInfo.InvariantCulture, "Server.{0}", subCode)));
    }
    else
    {
        return FaultCode.CreateReceiverFaultCode(
            new FaultCode(subCode));
    }
}

```

We can even go a step further and introduce these helpers that would construct a `FaultException<T>` for us:

```
public static FaultException<T>CreateSenderFault<T>(T detail, 
    string faultReason, string faultSubCode)
{
    return new FaultException<T>(detail, 
        new FaultReason(faultReason), CreateSenderFaultCode(faultSubCode));
}

public static FaultException<T>CreateReceiverFault<T>(T detail, 
    string faultReason, string faultSubCode)
{
    return new FaultException<T>(detail, 
        new FaultReason(faultReason), CreateReceiverFaultCode(faultSubCode));
}

```

Now handling an exception at the service and returning a fault looks like this:

```
try
{
    return manager.PerformOperation();
}
catch ( BusinessException e)
{
    throw Helpers.CreateSenderFault(
        new InvalidParametersFault { Message = e.Message }, 
        "Invalid parameters.", 
        "Validation");
}

```

Normally you should catch specific business exception at the service and return corresponding faults. But what if we have an unknown exception? In most cases it represents a server error that was unexpected and we should return a 50x HTTP response. But the default behavior is to send back 'Sender' fault codes. So we need to catch an Exception object and construct the `FaultException` ourselves.  
We could add a catch block to each of operations but we are much better off making use of error handler. I usually use an error handler for uncaught exceptions that looks similar to this:

```
public class ErrorHandler : IErrorHandler
{
    public void ProvideFault(Exception error, MessageVersion version, ref Message fault)
    {
        if (fault == null && !(error is FaultException)) // service implementation might have already thrown a fault
        {
            var detail = new GenericFault{ Message = error.Message };

            FaultException<GenericFault> exception =
                new FaultException<GenericFault>(detail, 
                    new FaultReason(error.Message), Helpers.CreateReceiverFaultCode("GenericFault"));

            MessageFault mf = exception.CreateMessageFault();

            fault = Message.CreateMessage(version, mf, exception.Action);
        }
    }

    public bool HandleError( Exception error)
    {
        // this one will be called second, after the fault is sent to the client
        // we can do additional logging here

        return true;
    }
}

```

To add our handler to the service we need to implement a service behavior that can be applied either through configuration or by decorating our service with an attribute. Here's how you could write an attribute that also implements `IServiceBehavior`:

```
[AttributeUsage( AttributeTargets.Class)]
public sealed class ErrorHandlerAttribute : Attribute, IServiceBehavior
{
    public void AddBindingParameters(ServiceDescription serviceDescription, ServiceHostBase serviceHostBase,
        Collection<ServiceEndpoint> endpoints, BindingParameterCollection bindingParameters)
    {
    }

    public void ApplyDispatchBehavior(ServiceDescription serviceDescription, ServiceHostBase serviceHostBase)
    {
        foreach(ChannelDispatcher dispatcher in serviceHostBase.ChannelDispatchers)
        {
            dispatcher.ErrorHandlers.Add(new ErrorHandler());
        }
    }

    public void Validate(ServiceDescription serviceDescription, ServiceHostBase serviceHostBase)
    {
    }
}

```

I find these helpers really handy when I need to create a new service and want error handling concerns to be addressed right away from the start. I've seen lots of projects that put off proper error handling (and other cross-cutting concerns like logging and configuration) and then try to catch up. This time could have been spent more productively if they had thought about these things up front.