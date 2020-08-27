---
title: InfoPath, SharePoint and cross domain issues
date: 2010-10-26T05:32:00.000Z
lastmod: 2015-04-23T17:11:40.000Z
permalink: infopath-sharepoint-and-cross-domain-issues
uuid: 75c72319-c239-4c31-a3d6-c7d19dbce718
tags: SharePoint
---

I wrote an InfoPath form that was supposed to submit data to my web service. Upon submission it failed with the following message:

> The form cannot be submitted because this action would violate cross-domain restrictions.
> 
> If this form template is published to a SharePoint document library, cross-domain access for user form templates must be enabled under InfoPath Forms Services in SharePoint Central Administration, and the data connection settings must be stored in a UDC file in a data connection library in the same site collection.
> 
> If this is an administrator-approved form template, the security level of the form must be set to full trust, or the data connection settings must be stored in a UDC file by using the Manage data connection files option under InfoPath Forms Services in SharePoint Central Administration
> 
> An entry has been added to the Windows event log of the server.  
> Log ID:5758

All would be fine fine if I really tried to call a web service on another domain but in my case it was a service deployed on the same site as the form itself.

SharePoint’s log files kept telling the same story:

> 10/26/2010 10:56:31.55     w3wp.exe (0x1C70)                           0x0AB8    InfoPath Forms Services           Runtime - Data Connections        eq8l    Warning     The form could not be submitted to Main submit because this action would violate cross-domain security restrictions.  To allow this data connection for administrator-approved forms, enable full trust for the form template, or add the connection to a Data Connection Library.  For user forms, cross-domain connections must be enabled in SharePoint Central Administration, and all connections must be in a Data Connection Library.  For more information, please see the security documentation for InfoPath Forms Services.

Ok, I understand that and I also understand why it acts like this, see [this article](http://blogs.msdn.com/b/infopath/archive/2006/10/02/data-connections-in-browser-forms.aspx) for explanation. But my service is deployed on the same site and thus there is no cross-domain call per se.

Digging further I stumbled upon the following warnings in the Windows Event Log:

Alternate access mappings have not been configured.  Users or services are accessing the site _http://dzimchuk:82_ with the URL _http://dzimchuk.mydomain.com:82_.  This may cause incorrect links to be stored or returned to users.  If this is expected, add the URL _http://dzimchuk.mydomain.com:82_ as an AAM response URL.  For more information, see: [http://go.microsoft.com/fwlink/?LinkId=114854](http://go.microsoft.com/fwlink/?LinkId=114854)

That was actually the root of the problem. When I looked at manifest.xsf within my form I noticed this:

```
<xsf:operation name="SubmitData" 
 soapAction="http://www.blahblah.com/2010/10/IService/SubmitData" 
 serviceUrl="http://dzimchuk.mydomain.com:82/_vti_bin/
             InfoPathForms/Service.svc">
    ...
</xsf:operation>
```

So InfoPath Designer was kind enough to save the fully resolved path to the machine although I entered it without domain.

In order to fix this particular issue we have to create a mapping. Go to the Central Administration –> System Settings –> Configure Alternative Access Mappings:

[![Alternate Access Mappings screen](https://blogcontent.azureedge.net/sp_aam_thumb.png "Alternate Access Mappings screen")](https://blogcontent.azureedge.net/sp_aam.png) 

Here we need to add another internal URL (_http://dzimchuk.mydomain.com:82_) that would map to the public _http://dzimchuk:82_:

[![Add new mapping](https://blogcontent.azureedge.net/sp_aam_add_thumb.png "Add new mapping")](https://blogcontent.azureedge.net/sp_aam_add.png)

That’s it.

## Real cross domain issue

Ok, that was useful but what if really wanted to call a service from another domain from a form with Domain security level? I would probably have to follow the recommendations that were given in error messages shown above. Let’s try them out!

Go on and create a new data connection library on your site. Then open the form in InfoPath Designer and convert the submission external connection to a connection file:

[![Convert connection to connection file](https://blogcontent.azureedge.net/sp_ip_convert_thumb.png "Convert connection to connection file")](https://blogcontent.azureedge.net/sp_ip_convert.png)

Here you have to enter an address of your connection library (you can use regular spaces instead of %20) and the filename of the connection. The path to the connection file is actually stored in a relative form (‘concept’ is a relative path to my site, that is _http://dzimchuk:82/concept_):

[![Converted connection](https://blogcontent.azureedge.net/sp_ip_converted_thumb.png "Converted connection")](https://blogcontent.azureedge.net/sp_ip_converted.png)

This is really useful when you want to re-use your form on different servers and that’s why storing your external connections  as connection files is a recommended way in these scenarios.

Republish the form.

Now if you go to the connection library you will see the connection file. However, it’s not ready to be used yet. Site administrator must approve it first:

[![Connection file](https://blogcontent.azureedge.net/sp_udx_approve_thumb.png "Connection file")](https://blogcontent.azureedge.net/sp_udx_approve.png) 

This makes the whole lotta sense as it’s up to a site (or site collection) administrator (owner) to allow or disallow connections especially when they are to be used to cross domain calls.

But even that’s not enough! Your farm administrator should allow InfoPath forms to make cross domain calls explicitly. This is done in Central Administration –> General Application Settings –> InfoPath Forms Services –> Configure InfoPath Forms Services:

[![Enable cross domain calls](https://blogcontent.azureedge.net/sp_ip_cross_domain_thumb.png "Enable cross domain calls")](https://blogcontent.azureedge.net/sp_ip_cross_domain.png)

Now it works.

## Final words

My original problem wasn’t about cross domain issue. Well, technically it was as two different URLs were treated as though they belong to separate domains. If this is your situation you know how to go around it.

If you really need to make cross domain calls you will need to follow the steps outline above. Note that they require approval from site administrators. Even if you deploy a form with Full Trust level it must be approved by the farm administrator.

And finally keeping your connections in connection files make it easier to re-use your forms (and connections) across different servers.