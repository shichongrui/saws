import { getProjectName } from "../../../utils/get-project-name";
import { uppercase } from "../../../utils/uppercase";

type WebsiteTemplateParameters = {
  name: string;
  stage: string;
  domain?: string;
  certificateArn?: string;
  isCustomDomain?: boolean;
};

export const getTemplate = ({
  name,
  stage,
  domain,
  certificateArn,
  isCustomDomain,
}: WebsiteTemplateParameters) => {
  const customDomainRecords: Record<string, unknown> = {};
  if (isCustomDomain) {
    customDomainRecords.WebsiteCloudfrontDistribution = {
      Type: "AWS::CloudFront::Distribution",
      Properties: {
        DistributionConfig: {
          Origins: [
            {
              DomainName: {
                "Fn::Select": [
                  2,
                  {
                    "Fn::Split": [
                      "/",
                      {
                        "Fn::GetAtt": ["WebsiteS3Bucket", "WebsiteURL"],
                      },
                    ],
                  },
                ],
              },
              Id: "S3Origin",
              CustomOriginConfig: {
                HTTPPort: "80",
                HTTPSPort: "443",
                OriginProtocolPolicy: "http-only",
              },
            },
          ],
          Enabled: true,
          HttpVersion: "http2",
          DefaultRootObject: "index.html",
          Aliases: [`www.${domain}`, domain],
          DefaultCacheBehavior: {
            AllowedMethods: ["GET", "HEAD"],
            Compress: false,
            TargetOriginId: "S3Origin",
            ForwardedValues: {
              QueryString: true,
              Cookies: {
                Forward: "none",
              },
            },
            ViewerProtocolPolicy: "redirect-to-https",
          },
          PriceClass: "PriceClass_All",
          ViewerCertificate: {
            AcmCertificateArn: certificateArn,
            SslSupportMethod: "sni-only",
          },
        },
      },
    };

    customDomainRecords.WebsiteDNSName = {
      Type: "AWS::Route53::RecordSetGroup",
      Properties: {
        HostedZoneName: domain + ".",
        RecordSets: [
          {
            Name: domain,
            Type: "A",
            AliasTarget: {
              HostedZoneId: "Z2FDTNDATAQYW2",
              DNSName: { "Fn::GetAtt": ["WebsiteCloudfrontDistribution", "DomainName"] }
            },
          },
          {
            Name: `www.${domain}`,
            Type: "A",
            AliasTarget: {
              HostedZoneId: "Z2FDTNDATAQYW2",
              DNSName: { "Fn::GetAtt": ["WebsiteCloudfrontDistribution", "DomainName"] }
            },
          },
        ],
      },
    };
  }

  return JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "AWS Cloudformation for Saws Postgres",
    Resources: {
      WebsiteS3Bucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: domain,
          AccessControl: "PublicRead",
          WebsiteConfiguration: {
            IndexDocument: "index.html",
          },
        },
      },
      WebsiteBucketPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          PolicyDocument: {
            Id: `${uppercase(name)}${uppercase(stage)}WebsitePolicy`,
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "PublicReadForGetBucketObjects",
                Effect: "Allow",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: {
                  "Fn::Join": [
                    "",
                    [
                      "arn:aws:s3:::",
                      {
                        Ref: "WebsiteS3Bucket",
                      },
                      "/*",
                    ],
                  ],
                },
              },
            ],
          },
          Bucket: {
            Ref: "WebsiteS3Bucket",
          },
        },
      },
      ...customDomainRecords,
    },
    Outputs: {
      websiteS3Url: {
        Value: {
          "Fn::GetAtt": ["WebsiteS3Bucket", "WebsiteURL"],
        },
      },
    },
  });
};

export const getStackName = (stage: string, name: string) => {
  const projectName = getProjectName();
  return `${projectName}-${stage}-${name}`;
};
