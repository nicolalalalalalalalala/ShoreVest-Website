'use strict';

(async () => {
  const expectedHost = 'netorgft1774351.sharepoint.com';
  const sitePath = '/sites/Recruitment';
  const schemaUrl =
    'https://raw.githubusercontent.com/shorevest/website/7b147cba6bb99e6feb42fe5f36757600679858e4/infra/recruitment/sharepoint-lists.v1.json';

  if (window.location.hostname.toLowerCase() !== expectedHost) {
    throw new Error(`Open https://${expectedHost}${sitePath} before running this script.`);
  }
  if (!window.location.pathname.toLowerCase().startsWith(sitePath.toLowerCase())) {
    throw new Error(`Open https://${expectedHost}${sitePath} before running this script.`);
  }

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const xmlEscape = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  const odataEscape = (value) => String(value).replace(/'/g, "''");

  async function readJson(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_) {
      return { raw: text };
    }
  }

  const schemaResponse = await fetch(schemaUrl, { cache: 'no-store' });
  if (!schemaResponse.ok) {
    throw new Error(`Could not download the approved SharePoint schema: HTTP ${schemaResponse.status}`);
  }
  const schema = await schemaResponse.json();

  const digestResponse = await fetch(`${sitePath}/_api/contextinfo`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json;odata=nometadata'
    }
  });
  const digestBody = await readJson(digestResponse);
  if (!digestResponse.ok) {
    throw new Error(`Could not acquire a SharePoint request digest: HTTP ${digestResponse.status}`);
  }
  const requestDigest =
    digestBody.FormDigestValue ||
    digestBody.d?.GetContextWebInformation?.FormDigestValue;
  if (!requestDigest) {
    throw new Error('SharePoint did not return a request digest.');
  }

  async function sharePointRequest(endpoint, options = {}) {
    const method = options.method || 'GET';
    const headers = {
      Accept: 'application/json;odata=nometadata',
      ...(options.headers || {})
    };
    if (method !== 'GET' && method !== 'HEAD') {
      headers['X-RequestDigest'] = requestDigest;
    }
    if (options.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json;odata=nometadata';
    }

    const response = await fetch(`${sitePath}${endpoint}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const body = await readJson(response);
    if (!response.ok) {
      const message =
        body?.error?.message?.value ||
        body?.error?.message ||
        body?.raw ||
        `HTTP ${response.status}`;
      throw new Error(`${method} ${endpoint} failed: HTTP ${response.status}: ${message}`);
    }
    return body;
  }

  function fieldType(column) {
    switch (column.type) {
      case 'text': return 'Text';
      case 'multilineText': return 'Note';
      case 'choice': return 'Choice';
      case 'dateTime': return 'DateTime';
      case 'number': return 'Number';
      case 'boolean': return 'Boolean';
      default: throw new Error(`Unsupported SharePoint column type: ${column.type}`);
    }
  }

  function fieldSchemaXml(column, indexedFields) {
    const indexed = indexedFields.has(column.name) || column.enforceUniqueValues === true;
    const attributes = [
      `Type="${fieldType(column)}"`,
      `Name="${xmlEscape(column.name)}"`,
      `StaticName="${xmlEscape(column.name)}"`,
      `DisplayName="${xmlEscape(column.name)}"`,
      `Group="ShoreVest Recruitment"`,
      `Required="${column.required === true ? 'TRUE' : 'FALSE'}"`,
      `Hidden="FALSE"`,
      `ReadOnly="${column.readOnly === true ? 'TRUE' : 'FALSE'}"`
    ];

    if (indexed) attributes.push('Indexed="TRUE"');
    if (column.enforceUniqueValues === true) attributes.push('EnforceUniqueValues="TRUE"');

    let childXml = '';
    switch (column.type) {
      case 'text':
        attributes.push('MaxLength="255"');
        break;
      case 'multilineText':
        attributes.push('NumLines="6"', 'RichText="FALSE"', 'AppendOnly="FALSE"');
        break;
      case 'choice':
        attributes.push('Format="Dropdown"', 'FillInChoice="FALSE"');
        childXml = `<CHOICES>${column.choices.map((choice) =>
          `<CHOICE>${xmlEscape(choice)}</CHOICE>`).join('')}</CHOICES>`;
        break;
      case 'dateTime':
        attributes.push('Format="DateTime"', 'FriendlyDisplayFormat="Disabled"');
        break;
      case 'number':
        attributes.push('Decimals="0"');
        break;
      case 'boolean':
        if (Object.prototype.hasOwnProperty.call(column, 'defaultValue')) {
          childXml = `<Default>${column.defaultValue === true ? '1' : '0'}</Default>`;
        }
        break;
      default:
        break;
    }

    return `<Field ${attributes.join(' ')}>${childXml}</Field>`;
  }

  async function listFields(listName) {
    const escaped = odataEscape(listName);
    const body = await sharePointRequest(
      `/_api/web/lists/getbytitle('${escaped}')/fields?$select=Id,InternalName,Title,Indexed,EnforceUniqueValues&$top=500`
    );
    return Array.isArray(body.value) ? body.value : [];
  }

  async function createField(listName, column, indexedFields) {
    const escaped = odataEscape(listName);
    return sharePointRequest(
      `/_api/web/lists/getbytitle('${escaped}')/fields/createfieldasxml`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=verbose'
        },
        body: {
          parameters: {
            __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
            SchemaXml: fieldSchemaXml(column, indexedFields),
            Options: 0
          }
        }
      }
    );
  }

  async function updateListSettings(listDefinition) {
    const escaped = odataEscape(listDefinition.name);
    await sharePointRequest(`/_api/web/lists/getbytitle('${escaped}')`, {
      method: 'POST',
      headers: {
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE',
        'Content-Type': 'application/json;odata=nometadata'
      },
      body: {
        Description: listDefinition.description,
        EnableAttachments: false
      }
    });
  }

  console.log('Starting ShoreVest recruitment SharePoint provisioning...');
  const result = [];

  for (const listDefinition of schema.lists) {
    const indexedFields = new Set(listDefinition.indexedFields || []);
    console.group(`Configuring ${listDefinition.name}`);
    await updateListSettings(listDefinition);

    let fields = await listFields(listDefinition.name);
    const existingNames = new Set(fields.map((field) => field.InternalName));

    for (const column of listDefinition.columns) {
      if (column.name === 'Title' || existingNames.has(column.name)) {
        console.log(`${column.name}: already exists`);
        continue;
      }
      await createField(listDefinition.name, column, indexedFields);
      existingNames.add(column.name);
      console.log(`${column.name}: created`);
      await sleep(100);
    }

    fields = await listFields(listDefinition.name);
    const finalByName = new Map(fields.map((field) => [field.InternalName, field]));
    const missing = listDefinition.columns
      .map((column) => column.name)
      .filter((name) => !finalByName.has(name));
    const indexErrors = (listDefinition.indexedFields || [])
      .filter((name) => finalByName.has(name) && finalByName.get(name).Indexed !== true);
    const keyField = finalByName.get(listDefinition.keyField);
    const uniqueError = Boolean(keyField && keyField.EnforceUniqueValues !== true);

    if (missing.length || indexErrors.length || uniqueError) {
      throw new Error([
        `${listDefinition.name} verification failed.`,
        missing.length ? `Missing: ${missing.join(', ')}` : '',
        indexErrors.length ? `Not indexed: ${indexErrors.join(', ')}` : '',
        uniqueError ? `${listDefinition.keyField} is not unique.` : ''
      ].filter(Boolean).join(' '));
    }

    result.push({
      list: listDefinition.name,
      columns: listDefinition.columns.length,
      indexed: listDefinition.indexedFields.length,
      attachmentsEnabled: false
    });
    console.log(`${listDefinition.name}: schema verified`);
    console.groupEnd();
  }

  console.table(result);
  console.log('Recruitment SharePoint schema provisioned successfully. Public recruitment settings were not changed.');
})().catch((error) => {
  console.error('Recruitment SharePoint provisioning failed:', error);
  throw error;
});
