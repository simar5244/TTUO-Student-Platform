\set ON_ERROR_STOP on
\copy sf_origin.recordtype FROM 'samples/recordtype.csv' CSV HEADER
\copy sf_origin.ttu_term__c FROM 'samples/term.csv' CSV HEADER
\copy sf_origin.ttu_academic_program__c FROM 'samples/program.csv' CSV HEADER
\copy sf_origin.application FROM 'samples/application.csv' CSV HEADER
\copy sf_origin.contact FROM 'samples/contact.csv' CSV HEADER
\copy sf_origin.account FROM 'samples/account.csv' CSV HEADER
\copy sf_origin.interaction FROM 'samples/interaction.csv' CSV HEADER
\copy "AH".applications FROM 'samples/ah_applications.csv' CSV HEADER
CREATE INDEX IF NOT EXISTS idx_app_contact ON sf_origin.application ("TargetX_SRMb__Contact__c");
CREATE INDEX IF NOT EXISTS idx_app_term ON sf_origin.application ("TargetX_SRMb__Start_Term_and_Year__c");
CREATE INDEX IF NOT EXISTS idx_contact_email ON sf_origin.contact ("Email");
CREATE INDEX IF NOT EXISTS idx_contact_status ON sf_origin.contact ("TargetX_SRMb__Status__c");
CREATE INDEX IF NOT EXISTS idx_contact_phone ON sf_origin.contact ("MobilePhone");
SELECT 'recordtype', count(*) FROM sf_origin.recordtype
UNION ALL SELECT 'term', count(*) FROM sf_origin.ttu_term__c
UNION ALL SELECT 'program', count(*) FROM sf_origin.ttu_academic_program__c
UNION ALL SELECT 'application', count(*) FROM sf_origin.application
UNION ALL SELECT 'contact', count(*) FROM sf_origin.contact
UNION ALL SELECT 'account', count(*) FROM sf_origin.account
UNION ALL SELECT 'interaction', count(*) FROM sf_origin.interaction
UNION ALL SELECT 'ah_applications', count(*) FROM "AH".applications;
