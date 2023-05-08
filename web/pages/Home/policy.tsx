import { A } from '@solidjs/router'
import { Component } from 'solid-js'
import PageHeader from '../../shared/PageHeader'
import Divider from '../../shared/Divider'

import logo from '../../assets/logo.png'

const Policy: Component = () => {
  return (
    <div class="container">
      <PageHeader title="Policy" subtitle="Introduction" />
      <section class="flex flex-shrink flex-col  gap-4">
        <div>
          This Privacy Policy governs the collection, use, and disclosure of personal information by
          Demandcluster B.V. ("Demandcluster") through its AI chat website Charluv (the "Site").{' '}
        </div>
        <div>
          Demandcluster respects your privacy and is committed to protecting your personal
          information. By using our Site, you consent to our Privacy Policy and our processing of
          your personal information in accordance with this policy.{' '}
        </div>
      </section>
      <Divider />
      <section class="flex flex-shrink flex-col  gap-4">
        <h3 class="text-2xl">Where This Privacy Policy Applies</h3>
        <div>
          This Privacy Policy applies to personal information collected through the Site. It does
          not apply to personal information collected through other means, such as offline, or
          through third-party websites that may link to the Site.
        </div>
      </section>
      <Divider />
      <section class="flex flex-shrink flex-col  gap-4">
        <h3 class="text-2xl">Information We Collect</h3>
        <div>We collect the following personal information when you use the Site:</div>
        <div>
          Username: We only collect the username that you provide us. Please note that the username
          you choose may indirectly reveal personal information about you.
        </div>
        <div>
          Log Data: Our servers automatically collect certain information about how you interact
          with our Site, including IP address, browser type, operating system, pages viewed, and
          other similar information.
        </div>
      </section>
      <Divider />
      <section class="flex flex-shrink flex-col  gap-4">
        <h3 class="text-2xl">How We Use Information</h3>
        <div>We use the personal information we collect for the following purposes:</div>
        <div>To provide the services and functionality of the Site;</div>
        <div>To operate, maintain, and improve the Site;</div>
        <div>To personalize your experience on the Site;</div>
        <div>To communicate with you about the Site and your use of the Site;</div>
        <div>To enforce our policies and terms of use;</div>
        <div>To comply with legal obligations.</div>
      </section>
      <Divider />
      <section class="flex flex-shrink flex-col  gap-4">
        <h3 class="text-2xl">How We Share Information</h3>
        <div>
          We do not share your personal information with affiliates, partners, or other third
          parties, except as necessary for the operation of the Site, or as required by law.
        </div>
      </section>
      <Divider />
      <section class="flex flex-shrink flex-col  gap-4">
        <h3 class="text-2xl">Cross-Border Data Transfers</h3>
        <div>
          All personal information we collect is stored in servers located within the European
          Economic Area (EEA). By using the Site, you acknowledge and consent to the transfer of
          your personal information to the EEA for storage and processing.
        </div>
      </section>
      <Divider />
      <section class="flex flex-shrink flex-col  gap-4">
        <h3 class="text-2xl">Your Rights</h3>
        <div>
          You have the right to access, rectify, and delete your personal information. You may also
          have the right to object to or restrict certain types of processing, and to request data
          portability. To exercise these rights, please contact us using the information provided
          below.
        </div>
      </section>
      <Divider />
      <section class="flex flex-shrink flex-col  gap-4">
        <h3 class="text-2xl">How Long We Retain Your Information</h3>
        <div>
          We retain your personal information only for as long as necessary to provide the services
          and functionality of the Site, or as required by law.
        </div>
      </section>
      <Divider />
      <section class="flex flex-shrink flex-col  gap-4">
        <h3 class="text-2xl">Children's Privacy</h3>
        <div>
          The Site is not intended for use by children under the age of 18. If we learn that we have
          collected personal information from a child under the age of 18, we will take steps to
          delete that information as soon as possible.
        </div>
      </section>
      <Divider />
      <section class="flex flex-shrink flex-col  gap-4">
        <h3 class="text-2xl">Job Candidates, Contractors, and Vendor Representatives</h3>
        <div>
          If you apply for a job with Demandcluster, or if you are a contractor or vendor
          representative, we may collect personal information about you in connection with your
          application or engagement. We use this information only for the purposes of evaluating
          your application or engagement and communicating with you about it.
        </div>
      </section>
      <Divider />
      <section class="flex flex-shrink flex-col  gap-4">
        <h3 class="text-2xl">Privacy Policy Changes</h3>
        <div>
          We may update this Privacy Policy from time to time. We will notify you of any material
          changes to the Privacy Policy by posting the revised policy on the Site.
        </div>
      </section>
      <Divider />
      <section class="flex flex-shrink flex-col  gap-4">
        <h3 class="text-2xl">How To Contact Us</h3>
        <div>
          If you have any questions or concerns about this Privacy Policy, or if you wish to
          exercise your rights regarding your personal information, please contact us at:
        </div>
        <div>Demandcluster B.V.</div>
        <div>Diemermere 1</div>
        <div>1112TA Diemen</div>
        <div>Email: privacy@demandcluster.com</div>
        <div></div>
      </section>
      <Divider />
    </div>
  )
}
export default Policy
