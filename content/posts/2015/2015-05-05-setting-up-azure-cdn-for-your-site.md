---
title: Setting up Azure CDN for your site
date: 2015-05-05 17:40:46
permalink: setting-up-azure-cdn-for-your-site
excerpt: Microsoft Azure provides a modern CDN service that will help boost performance of your web applications. The service acts as a globally distributed pass-through cache and you can choose the backing service it will use to fetch original files from.
uuid: 800288ef-2070-48ff-8ef0-d588c3eecb8e
tags: Azure Services
---

Microsoft Azure provides a modern CDN service that will help boost performance of your web applications. The service acts as a globally distributed pass-through cache and you can choose the backing service it will use to fetch original files from. You have three options currently:

*   [Azure Blob Storage](http://azure.microsoft.com/en-us/documentation/articles/cdn-serve-content-from-cdn-in-your-web-application/ "Serve Content from Azure CDN in Your Web Application")
*   [Azure Cloud Services](http://azure.microsoft.com/en-us/documentation/articles/cdn-cloud-service-with-cdn/ "Integrate a cloud service with Azure CDN")
*   [Azure Web Apps](http://azure.microsoft.com/en-us/documentation/articles/cdn-websites-with-cdn/ "Use Azure CDN in Azure App Service")

Although it seems pretty straightforward to set it up there are important concerns that you need to address and in this post I'm going to try to outline them so that you could take maximum advantage of the service.

## Automating content upload

What makes Web Apps/Cloud Services option so appealing is that it integrates content upload task with your general deployment process. Your entire web application can be used as a source for content to be cached at CDN. Of course, it may not be a good idea to run your whole application through CDN as dynamic content will make it slower. What you really need CDN for is to bring static content closer to your users and offload additional traffic from your application server.

Azure Blob Storage is the most flexible option because you can host your applications anywhere and only store the content you want to be served through CDN in Azure. However, it comes at increased maintenance cost as you will have to take care of uploading the content to Blob Storage. To keep the cost down you want to automate this process and make it part of your regular deployment. You can use a PowerShell script like [this](https://gallery.technet.microsoft.com/scriptcenter/Upload-Content-Files-from-41c2142a "Upload Content Files from ASP.NET Application to Azure Blobs") as a starting point. The script understands ASP.NET default project layout and will upload all files from 'Content' and 'Scripts' folders to Blob Storage.

## Content versioning

As you upload new versions of your static content you want CDN cache to throw away old versions and re-fetch new ones. Unfortunately there is no way you can reset the cache. Instead you want to address your resources in a versioned way so that new versions are cached independently.

A common technique that’s used to achieve resource versioning is to inject version information as part of the resource name or path. For example, here’s how this is done in [MiniBlog](https://github.com/madskristensen/MiniBlog) engine that powers my blog:

```
public static string FingerPrint(string rootRelativePath)
{
    if (HttpRuntime.Cache[rootRelativePath] == null)
    {
        string relative = VirtualPathUtility
            .ToAbsolute("~" + rootRelativePath);
        string absolute = HostingEnvironment.MapPath(relative);

        var date = File.GetLastWriteTime(absolute);
        var index = relative.LastIndexOf('.');

        var result = ConfigurationManager.AppSettings.Get("blog:cdnUrl") + 
             relative.Insert(index, "_" + date.Ticks);

        HttpRuntime.Cache.Insert(rootRelativePath, result, 
            new CacheDependency(absolute));
    }

    return HttpRuntime.Cache[rootRelativePath] as string;
}

```

This method is used whenever you need to add a reference to a static resource in your pages and resource names are modified like that:

```
<link rel="stylesheet" href="//<CDN id>.vo.msecnd.net/Content/site_635639482889105998.css" />
```

To support such versioned resource names it requires you to make changes in your application to properly interpret modified names and serve resources correctly. This can be achieved with either URL rewrites or custom handlers. Here's an example of the URL rewrite rule:

```
<rule name="fingerprint" stopProcessing="true">
  <match url="(.+)(_([0-9]{18})+\.)([\S]+)" />
  <action type="Rewrite" url="{R:1}.{R:4}" />
</rule>

```

An alternative solution is to use query strings. Azure CDN supports them but you need to explicitly enable this feature.

[![Query string support in Azure CDN](https://blogcontent.azureedge.net/0f9793fa-91a6-4b5c-9c87-e367689a501b.png "Query string support in Azure CDN")](https://blogcontent.azureedge.net/a7114226-be5a-45ca-9e37-883f037edbfd.png)

When enabled requests for the same resource name but with different query strings will be cached separately.

## Cache expiry

You can control how long items are considered valid in CDN cache with the same HTTP headers that you use to inform clients about preferred client caching strategy: `Cache-Control`, `Expires`, `Date`. You need to make sure to set `Cache-Control` to public and use either max-age directive or Expires header. Azure CDN will not only use these directives but will also output them back to calling clients. The way you add these headers depends on you applications. If it's a ASP.NET application running in IIS you can specify it in the [staticContent](http://www.iis.net/configreference/system.webserver/staticcontent) section of web.config:

```
<system.webServer>
    <staticContent>
      <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="365.00:00:00" />
    </staticContent>
</system.webServer>

```

```
HTTP/1.1 200 OK
Cache-Control: public, max-age=31536000
Date: Tue, 05 May 2015 19:50:40 GMT
Last-Modified: Mon, 04 May 2015 19:24:06 GMTX-Cache: HIT 
```

If you use Azure Blob Storage as the backing service you can define `Cache-Control` as a properly of a blob:

[![Azure blob properties allow you to specify Cache-Control value](https://blogcontent.azureedge.net/428f2bf5-a7df-4259-b090-8b7c6e72940d.png "Azure blob properties allow you to specify Cache-Control value")](https://blogcontent.azureedge.net/666a84d0-2469-4fae-8049-2f2d18986cff.png)

```
HTTP/1.1 200 OK
Cache-Control: max-age=31536000X-Cache: HIT 
```

Notice the `X-Cache` header indicating that the CDN cache has actually been hit.  

## Cross-domain issues

Your stylesheets are likely to reference resources such a background images or fonts using relative URLs. You should be aware that fonts are not going to work when served from CDN (at least in IE and Firefox) out of the box. When loading a font these browsers will check the `Access-Control-Allow-Origin` header and if it's missing or is set to not allow your origin the browser won't actually use the font.

The way you enable CORS again depends on your backing service. If it's an ASP.NET application running in IIS you can just create a new web.config file in the directory containing the fonts and specify your custom header there:

```
<?xml version="1.0"?>
<configuration>
  <system.webServer>
    <httpProtocol>
      <customHeaders>
        <add name="Access-Control-Allow-Origin" value="*"/>
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>

```

Remember that CDN will transmit all custom headers to the calling client:

```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Cache-Control: max-age=31536000
Content-Type: application/octet-stream
Date: Tue, 05 May 2015 20:15:31 GMT
Last-Modified: Fri, 17 Apr 2015 23:22:44 GMT
Server: ECAcc (fcn/40A1)
X-Cache: HIT
Content-Length: 2808

```

You can specify just your domain or leave it as '*' to allow everyone to request the resource. Note that you are specifying an 'origin' here and it includes not only the domain name but also a schema as well as port number.

Azure Blob Storage does support CORS however you can't easily set it up on the portal. Instead you need to either use [REST API](https://msdn.microsoft.com/library/azure/dn535601.aspx) or for example .NET client library to set the required properties on the storage service (see [this post](http://www.devtrends.co.uk/blog/hosting-web-fonts-in-azure-blob-storage-using-the-new-cors-support) for an example).

## Enable HTTPS

All but very simple sites will require SSL. And it is not enabled in Azure CDN endpoints by default.

![Enable HTTPS in Azure CDN endpoint](https://blogcontent.azureedge.net/51a0b56c-d94c-4fe5-b9a4-2d81593b5694.png)

I highly recommend you enable it right away when you set up an endpoint because provisioning it may take several hours and it will be that moment when you need it yesterday.

## Bundling and Minification

These are great techniques to reduce the number of simultaneous requests to your application server as well as minimizing the size of the content to download. The great news is that both techniques get [first class support](http://azure.microsoft.com/en-us/documentation/articles/cdn-websites-with-cdn/#bundling) if you use Web Apps or Cloud Services as your backing service.

When using Azure Blob Storage it adds to that increased maintenance cost I was talking about. You will need to run these tasks at build time and properly package artifacts to be uploaded to Blob Storage.

## Use multiple CDNs

Browsers limit the number of simultaneous connections per domain name. To optimize loading of your pages you want to use different CDNs that host well-known client side frameworks and libraries. For example, my blog gets Bootstrap from [MaxCDN](https://www.maxcdn.com/) and jQuery and fonts from [Google Hosted Libraries](https://developers.google.com/speed/libraries/). I use a single Azure CDN endpoint for the rest of my content. However, other sites may require much more static content and it will make sense to split their content over either multiple CDN endpoints or alternatively if you own a Domain and have access to DNS configuration you can set up `CNAME` records for several subdomains pointing to a single CDN endpoint.