---
title: Reading ad-hoc JSON string in .NET
date: 2010-12-06 06:27:00
permalink: reading-ad-hoc-json-string-in-net
uuid: 3711e836-ce8e-4abf-ac07-15ad8d1bc635
tags: Tips & Tricks, .NET
---

If you’re a web developer you’re probably familiar with `System.Web.Script.Serialization.JavaScriptSerializer` that's heavily used by ASP.NET AJAX framework and of course you can use it to convert managed objects to JSON so it can be consumed by JavaScript.

Also, since .NET 3.5 there is `System.Runtime.Serialization.Json` namespace that includes `DataContractJsonSerializer` that you can use to serialize/desterilize managed objects to/from JSON strings. You can also influence the way objects get serialized with various attributes that you can apply on individual members. What attributes you use and what members will be included in serialization depend on whether you mark your object as `DataContract` or mark it as `Serializable`.

Still, both serializers assume you have a managed class that describes your data structure. But what if you don’t know the structure of your data upfront? All you know is that it’s going to be represented as JSON and you just need an easy way to parse it and extract the value by a known key if it exists.

Luckily, `System.Runtime.Serialization.Json` namespace also includes `JsonReaderWriterFactory` class that makes it possible to consume JSON data from a string and read it as an XML document. Basically it constructs a special version of `XmlDictionaryReader` that you can use either through a traditional `XMLReader` interface or you can feed it to `XDocument` and consume your data through Linq To XML.

`JsonReaderWriterFactory` can also play in the opposite direction, that is it gives you a special version of `XmlDictionaryWriter` and you can use standard `XMLWriter`/`XmlDictionaryWriter`<font face="Calibri">interface to output your data that will be written to a stream encoded as JSON. This may seem less important than reading as you control your data and you probably have an object graph representing it. So you can just use of the serializers. Still, the  more options the better. In fact, `DataContractJsonSerializer` uses `JsonReaderWriterFactory` under the hood.</font>

Ok, back to reading. Say, we were told that an authentication token will passed as part of a JSON string. A JavaScript developer also wanted to reserve a possibility to send more data to our managed component as part of that object. So in the end we received the following string:

"{"AuthToken": "ASDAF", "ID": 10, "Data": {"key": 2}}"

See how easy it is to read this data:

```
private void Go()
{
    string s = 
"{\"AuthToken\": \"ASDAF\", \"ID\": 10, \"Data\": {\"key\": 2}}";
    byte[] bytes = Encoding.Unicode.GetBytes(s);

    using (XmlDictionaryReader reader =
        JsonReaderWriterFactory.CreateJsonReader(bytes, 
         new XmlDictionaryReaderQuotas()))
    {
        Read(reader);
    }
}

private void Read(XmlReader reader)
{
    while (reader.Read())
    {
        Console.WriteLine("Type={0}\tName={1}\tValue={2}",
            reader.NodeType, reader.Name, reader.Value);
        if (reader.AttributeCount > 0)
        {
            while (reader.MoveToNextAttribute())
            {
                Console.WriteLine("Type={0}\tName={1}\tValue={2}",
                    reader.NodeType, reader.Name, reader.Value);
            }
        }
    }
}
```

Here’s the output of the sample:

[![JSON string read as XML](https://blogcontent.azureedge.net/json_xml_thumb.png "JSON string read as XML")](https://blogcontent.azureedge.net/json_xml.png)

Looking at this output we can construct the following XML document:

```
<root type="object">
    <AuthToken type="string">ASDEF</AuthToken>
    <ID type="number">10</ID>
    <Data type="object">
        <key type="number">2</key>
    </Data>
</root>
```

If we have a little more knowledge about the structure of data we can use more efficient code. For example, if we know that the authentication token is within an ‘AuthToken’ element that is direct child of the root element you could write the following code:

```
private void GetAuthToken(XmlReader reader)
{
    XDocument doc = XDocument.Load(reader);
    string token = (from el in doc.Root.Elements()
                    where "AuthToken".Equals(el.Name.ToString(), 
                      StringComparison.InvariantCultureIgnoreCase)
                    select el.Value).FirstOrDefault();
    if (token != null)
        Console.WriteLine(token);
}
```

But even if we don’t know exactly at what level the authentication token is but we know the name of an element or an attribute containing it we can at least find it by going through the document with `XMLReader`.

## Important note for those targeting .NET 3.5

Although official documentation states that `System.Runtime.Serialization.Json` namespace is found in System.Runtime.Serialization.dll assembly it is true only for .NET 4 version of that assembly.

In the 3.5 version that namespace is missing. However, it is found in System.ServiceModel.Web assembly (basically because new JSON serializer was implemented for WCF needs first). So you will need to reference all these 3 assemblies:

[![Referenced assemblies (.NET 3.5)](https://blogcontent.azureedge.net/json_35_thumb.png "Referenced assemblies (.NET 3.5)")](https://blogcontent.azureedge.net/json_35.png)

If you target .NET 4 you need to just reference System.Runtime.Serialization.dll.