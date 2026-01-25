import { Construct } from "constructs";
import { App, TerraformStack } from "cdktf";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { Instance } from "@cdktf/provider-aws/lib/instance";
import { Vpc } from "@cdktf/provider-aws/lib/vpc";
import { Subnet } from "@cdktf/provider-aws/lib/subnet";
import { RdsCluster } from "@cdktf/provider-aws/lib/rds-cluster";
import { InternetGateway } from "@cdktf/provider-aws/lib/internet-gateway";
import { RouteTable } from "@cdktf/provider-aws/lib/route-table";
import { RouteTableAssociation } from "@cdktf/provider-aws/lib/route-table-association";
import { SecurityGroup } from "@cdktf/provider-aws/lib/security-group";
import { Ec2InstanceConnectEndpoint } from "@cdktf/provider-aws/lib/ec2-instance-connect-endpoint";
import { NetworkInterface } from "@cdktf/provider-aws/lib/network-interface";
import { DbSubnetGroup } from "@cdktf/provider-aws/lib/db-subnet-group";
import { RdsClusterInstance } from "@cdktf/provider-aws/lib/rds-cluster-instance";

class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // define resources here
    new AwsProvider(this, "AWS", {
      region: "ap-northeast-1",
    });

    //VPC定義
    const entireNetwork = new Vpc(this, "entireNetwork", {
      cidrBlock: "172.18.0.0/24",
    });
    //パブリックサブネット
    const publicSubnet = new Subnet(this, "publicSubnet", {
      vpcId: entireNetwork.id,
      availabilityZone: "ap-northeast-1a",
      cidrBlock: "172.18.0.0/28",
      mapPublicIpOnLaunch: true,
    });
    //プライベートサブネット
    const privateSubnetA = new Subnet(this, "privateSubnetA", {
      vpcId: entireNetwork.id,
      availabilityZone: "ap-northeast-1a",
      cidrBlock: "172.18.0.16/28",
    });
    const privateSubnetC = new Subnet(this, "privateSubnetB", {
      vpcId: entireNetwork.id,
      availabilityZone: "ap-northeast-1c",
      cidrBlock: "172.18.0.32/28",
    });
    const privateSubnetD = new Subnet(this, "privateSubnetC", {
      vpcId: entireNetwork.id,
      availabilityZone: "ap-northeast-1d",
      cidrBlock: "172.18.0.48/28",
    });
    //dbsubnet
    const dbPrivateSubnet = new DbSubnetGroup(this, "dbsubnet", {
      subnetIds: [privateSubnetA.id, privateSubnetC.id, privateSubnetD.id],
      name: "aurorasubnet",
    });
    //インターネットGW
    const intGW = new InternetGateway(this, "intGW", {
      vpcId: entireNetwork.id,
    });
    //パブリックサブネットのルーティングテーブル．デフォルトルートをインターネットGWに
    const publicRTTable = new RouteTable(this, "publicRTTable", {
      vpcId: entireNetwork.id,
      route: [
        {
          cidrBlock: "0.0.0.0/0",
          gatewayId: intGW.id,
        },
      ],
    });
    //パブリックサブネットとルーティングテーブルの紐付け
    new RouteTableAssociation(this, "publicRTTableAssociaiton", {
      subnetId: publicSubnet.id,
      routeTableId: publicRTTable.id,
    });
    //EICのSecurity Groupがいるはず
    const eicSecurityGroup = new SecurityGroup(this, "eicSecurityGroup", {
      name: "eicSecurityGroup",
      vpcId: entireNetwork.id,
      egress: [
        {
          description: "SSH",
          fromPort: 22,
          toPort: 22,
          cidrBlocks: ["172.18.0.0/24"],
          protocol: "tcp",
        },
      ],
    });
    const publicSecurityGroup = new SecurityGroup(this, "publicSecurityGroup", {
      name: "publicSecurityGroup",
      vpcId: entireNetwork.id,
      ingress: [
        {
          description: "SSH_from_EIC",
          fromPort: 22,
          toPort: 22,
          securityGroups: [eicSecurityGroup.id],
          protocol: "tcp",
        },
      ],
      egress: [
        {
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ["0.0.0.0/0"],
          protocol: "-1",
        },
      ],
    });

    const privateSecurityGroup = new SecurityGroup(this, "privateSecGrp", {
      name: "privateSecurityGroup",
      vpcId: entireNetwork.id,
      ingress: [
        {
          description: "db",
          fromPort: 5432,
          toPort: 5432,
          cidrBlocks: ["172.18.0.0/28"],
          protocol: "tcp",
        },
      ],
      egress: [
        {
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ["0.0.0.0/0"],
          protocol: "-1",
        },
      ],
    });

    //EIC
    new Ec2InstanceConnectEndpoint(this, "publicEic", {
      subnetId: publicSubnet.id,
      securityGroupIds: [eicSecurityGroup.id],
      preserveClientIp: false,
    });
    const publicENI = new NetworkInterface(this, "publicENI", {
      subnetId: publicSubnet.id,
      privateIps: ["172.18.0.10"],
      securityGroups: [publicSecurityGroup.id],
    });

    // rdscluster
    const rdsCluster = new RdsCluster(this, "rdsCluster", {
      clusterIdentifier: "test",
      engine: "aurora-postgresql",
      engineVersion: "15.4",
      masterUsername: "postgres",
      port: 5432,
      databaseName: "testdb",
      // すまんマジですまん
      masterPassword: "postgres",
      skipFinalSnapshot: true,
      dbSubnetGroupName: dbPrivateSubnet.name,
      vpcSecurityGroupIds: [privateSecurityGroup.id],
    });
    new RdsClusterInstance(this, "rdsClusterInstance", {
      clusterIdentifier: rdsCluster.clusterIdentifier,
      engine: rdsCluster.engine,
      instanceClass: "db.t3.medium",
      count: 2,
    });

    //psql -h <エンドポイント> -p 5432 -U <ユーザー名> -d <DB名>
    new Instance(this, "connection", {
      //amazonlinux
      ami: "ami-0c2da9ee6644f16e5",
      availabilityZone: "ap-northeast-1a",
      instanceType: "t2.micro",

      networkInterface: [
        {
          deviceIndex: 0,
          networkInterfaceId: publicENI.id,
        },
      ],
      userData: `#!/bin/bash
                sudo yum update
                sudo yum install -y postgresql15-server`,
    });
  }
}

const app = new App();
new MyStack(app, "infra");
app.synth();
