---
title: Disable SSL certificate validation during development
date: 2014-06-12T07:26:51.000Z
lastmod: 2015-04-22T18:32:51.000Z
permalink: disable-ssl-certificate-validation-during-development
uuid: 99486d97-d183-4230-ae30-8e0bbf6b8c0c
tags: Tips & Tricks
---

Every so often when I need to run some code that communicates with remote components over HTTPS in my development environment with a test or self-signed cert I run into an error saying that the certificate validation failed. I remember there is a way to override the check in .NET by subsribing to an event but it always takes me some time to find what that event is and what object provides it.

So here I am writing this post so you and I have an easier time finding in the future.  
If you use .NET components to communicate (be it WCF client or WebClient or HttpClient or what not) this is the code you might want to use:

```
public Task<Something> GetSomethingAsync()
{
    try
    {
        #if DEBUG
        System.Net.ServicePointManager.
            ServerCertificateValidationCallback += RemoteCertValidate;
        #endif

        return DoGetSomethingAsync();
    }
    finally
    {
        #if DEBUG
        System.Net.ServicePointManager.
            ServerCertificateValidationCallback -= RemoteCertValidate;
        #endif
    }
}

  private static bool RemoteCertValidate(object sender, 
    X509Certificate certificate, 
    X509Chain chain, 
    SslPolicyErrors sslpolicyerrors)
{
    return true;
}

private async Task<Something> DoGetSomethingAsync()
{
    var client = new HttpClient();
       // set up headers

       var response = await client.GetAsync("your endpoint");
    // check if there was an HTTP error code!

       var content = await response.Content.ReadAsStringAsync();
    return JsonConvert.DeserializeObject<Something>(content);
}

```

Two things worth mentioning here:

1.  Make sure you unsubscribe when you're done. This may not be necessary in some cases but in most of them this is important to prevent memory leaks. Imagine this code is a part of a data source or repository class that gets instantiated for each call. You don't want those instances hanging around.
2.  Prevent the certificate validation only when you're developing by putting in compiler directives #if DEBUG ... #endif. Production services should use valid certificates signed with trusted authorities.