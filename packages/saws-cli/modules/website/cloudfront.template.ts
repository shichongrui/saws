import { getProjectName } from "@shichongrui/saws-core";

type CloudfrontTemplateParameters = {
  domain: string;
  certificateArn: string;
  s3WebsiteUrl: string;
};

export const getTemplate = ({
  domain,
  certificateArn,
  s3WebsiteUrl,
}: CloudfrontTemplateParameters) =>
  JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "AWS Cloudformation for Saws Postgres",
    Resources: {
      WebsiteCloudfrontDistribution: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            Origins: [
              {
                DomainName: s3WebsiteUrl.split('/')[2],
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
      },
      WebsiteDNSName: {
        Type: "AWS::Route53::RecordSetGroup",
        Properties: {
          HostedZoneName: domain + ".",
          RecordSets: [
            {
              Name: domain,
              Type: "A",
              AliasTarget: {
                HostedZoneId: "Z2FDTNDATAQYW2",
                DNSName: {
                  "Fn::GetAtt": ["WebsiteCloudfrontDistribution", "DomainName"],
                },
              },
            },
            {
              Name: `www.${domain}`,
              Type: "A",
              AliasTarget: {
                HostedZoneId: "Z2FDTNDATAQYW2",
                DNSName: {
                  "Fn::GetAtt": ["WebsiteCloudfrontDistribution", "DomainName"],
                },
              },
            },
          ],
        },
      },
    },
    Outputs: {
      distributionId: {
        Description: "Cloudfront distribution id",
        Value: { Ref: "WebsiteCloudfrontDistribution" }
      }
    }
  });

export const getStackName = (stage: string, name: string) => {
  const projectName = getProjectName();
  return `${projectName}-${stage}-${name}`;
};
