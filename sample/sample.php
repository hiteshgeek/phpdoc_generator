<?php

/**
 * function lead_add_form
 *
 * @settings
 * - IS_OUTLET_ENABLE : Make Outlet Enable
 * @return void
 */
function lead_add_form()
{
    Utility::setHeaderButtons(array(
        array("link" => Jpath::fullUrl("lead/view"), "color" => 'text-warning', "icon" => 'fa-list', "text" => 'Manage Leads'),
        array("link" => Jpath::fullUrl("followup/view"), "color" => 'text-green', "icon" => 'fa-list', "text" => 'Manage followups'),
        array("class" => "manage-form-preferences", "color" => 'text-red', "icon" => 'fa-list', "text" => 'Manage Form Preference', "extra" => array(array("key" => "id", "value" => FormPreferenceId::LEAD)))
    ));

    $form = new GenericForm("lead-add-form");
    $form->enableCustomeErrorHandling();
    $form->setSubmitCallback("leadAddFormSubmit");

    $lead = new Lead();

    $leadoutlet = new FormSelectPicker('leadoutlet', 'Lead Outlet', true);
    $leadoutlet->setOnchangeCallback('leadOutletChangeCallback');
    $outlets = OutletManager::getUserCheckPoint(Session::loggedInUid());
    if ($outlets) {
        $selected_chkid = false;
        if ($lead->getId() > 0) {
            $selected_chkid = $lead->getOutlid();
        }
        foreach ($outlets as $outlet) {
            $selectOutlet = $selected_chkid == $outlet['id'] ? true : false;
            $leadoutlet->addItem($outlet['id'], $outlet['name'], $selectOutlet);
        }
    }
    //add lead panel/tpl
    $tpl = new Template(SystemConfig::templatesPath() . "lead/forms/add-lead");
    $tpl->section_title = "lead-add-wrapper";
    $tpl->panel_title = "Add Lead";
    $tpl->selected_chkid = $selected_chkid;

    if (!getSettings("IS_OUTLET_ENABLE")) {
        $outlets = [];
    }

    $tpl->outlets = $outlets;
    $content = get_lead_add_edit_form($form, $lead);
    $tpl->content = $content;

    return $tpl->parse();

    // $panel = new Panel("lead-add-wrapper", "fa-plus", "bg-red", "Add Lead");
    // $panel->setCustomHtml(get_lead_add_edit_form($form, $lead));
    // return $panel->publish();
}

/**
 * function lead_add_submit
 *
 * @settings
 * - IS_LEAD_FIRST_NAME_MANDATORY : Make First Name Mandatory in Lead
 * - IS_LEAD_LAST_NAME_MANDATORY : Make Last Name Mandatory in Lead
 * - IS_LEAD_SALUTATION_NOT_MANDATORY : Salutation Not Mandatory in Lead
 * - IS_SALUTATION_IN_LEAD_PAGE_HIDE : IS_SALUTATION_IN_LEAD_PAGE_HIDE
 * - IS_LEAD_COMPANY_NAME_MANDATORY : Make Company Name Mandatory in Lead
 * - IS_LEAD_ASSIGNEE_REQUIRE : Make Lead Assignee Require
 * - IS_LEAD_INDUSTRY_TYPE : Want Industry Type in Lead
 * - IS_LEAD_CONTACT_PERSON : IS_LEAD_CONTACT_PERSON
 * - IS_HIDE_LEAD_CURRENT_ADDRESS_DETAILS_ENABLED : IS_HIDE_LEAD_CURRENT_ADDRESS_DETAILS_ENABLED
 * - IS_CUSTOMER_ADDR_LINE_1_MANDATORY : Make Customer Address Line 1 Mandatory
 * - IS_CUSTOMER_ADDR_LINE_2_MANDATORY : Make Customer Address Line 2 Mandatory
 * - IS_CUSTOMER_ADDR_COUNTRY_MANDATORY : Make Customer Address Country Mandatory
 * - IS_CUSTOMER_ADDR_STATE_MANDATORY : Make Customer Address State Mandatory
 * - IS_CUSTOMER_ADDR_CITY_MANDATORY : Make Customer Address City Mandatory
 * - IS_CUSTOMER_ADDR_PIN_CODE_MANDATORY : Make Customer Address Pin Code Mandatory
 * - IS_CAPITAL_NAME : Wants to Show Capital Name
 * - IS_NAME_SAVE_IN_CAMEL_CASE_ENABLE : is Name save in camel case enable
 * - IS_LEAD_COMPANY_NAME : Want Company Name in Lead
 * - IS_LEAD_REVENUE : Want Revenue in Lead
 * - IS_LEAD_EMPLOYEE_STRENGTH : Want Employee Strength in Lead
 * - IS_MARKETING_PERSON_IS_ENABLED : When the setting is enabled, then marketing person field is enabled.
 * - IS_LEAD_MOBILE_UNIQUE : IS_LEAD_MOBILE_UNIQUE
 * - IS_LEAD_NAME_UNIQUE
 * - IS_CONTACT_DETAILS_OWNER_MANDATORY : Make Contact Details of Owner Mandatory
 * - IS_LEAD_FOLLOWUP_ALERT_MODE_MANDATORY
 * - IN_LEAD_TALUKA_IS_ENABLED : IN_LEAD_TALUKA_IS_ENABLED
 * - IN_LEAD_DISTRICT_IS_ENABLED : IN_LEAD_DISTRICT_IS_ENABLED
 * - IS_ROUTE_ENABLE : IS_ROUTE_ENABLE
 * - IS_LEAD_UPLOAD_FILE_ENABLE
 *
 * @param mixed $data
 * @return void
 */
function lead_add_submit($data)
{
    $response = new AjaxResponse(FALSE);
    $attributes = array();

    foreach ($data as $key => $val) {
        if (strpos($key, "lead-attribute-") === 0) {
            $attr_array = explode("-", $key);
            $attributes[$attr_array[2]] = $val;
        } else if (strpos($key, "attribute-") === 0) {
            $attr_array = explode("-", $key);
            $attributes[$attr_array[1]] = $val;
        }
    }

    if (isset($data['company-mobile']) && strlen($data['company-mobile']) < 10) {
        Utility::ajaxResponseFalse("Phone number should contain exactly 10 digits");
    }
    if (isset($data['lead_date']) && $data['lead_date'] == "") {

        Utility::ajaxResponseFalse("Please Enter Date");
    }
    $aadhar = isset($data['aadhar']) ? $data['aadhar'] : "";
    if (strlen($aadhar) > 0) {
        if (!is_valid_aadhar($aadhar)) {
            Utility::ajaxResponseFalse("Invalid Aadhar");
        }
    }


    if (strlen($aadhar) > 0 && !LeadManager::isAADHARAvailable($aadhar)) {
        Utility::ajaxResponseFalse("Addhar Already Exists");
    }

    if (isset($data['lead-type-radio']) && $data['lead-type-radio'] === '2') {
        if (getSettings("IS_LEAD_FIRST_NAME_MANDATORY")) {
            Validation::validateField($data['fname'], "Invalid first name, please specify the proper name", $response, TRUE);
        }
        if (getSettings("IS_LEAD_LAST_NAME_MANDATORY")) {
            Validation::validateField($data['lname'], "Invalid last name, please specify the proper name", $response, TRUE);
        }
        if (!preg_match('/^[a-zA-Z. ]*$/', $data['fname'])) {
            Utility::ajaxResponseFalse("Enter Name without any special characters and Numbers");
        }
        if (!getSettings("IS_LEAD_SALUTATION_NOT_MANDATORY") && !getSettings("IS_SALUTATION_IN_LEAD_PAGE_HIDE") && (!isset($data['salutation']) || $data['salutation'] < 1)) {
            Utility::ajaxResponseFalse("Please select a salutation");
        }
    } else {
        if (!defined(("IS_LEAD_COMPANY_NAME_MANDATORY")) || getSettings("IS_LEAD_COMPANY_NAME_MANDATORY")) {
            Validation::validateField($data['company-name'], "Invalid company name, please specify the proper name", $response, TRUE);
        }
    }
    if (getSettings("IS_LEAD_ASSIGNEE_REQUIRE")) {
        if (!empty($data["assignee"])) {
            $assignees = explode(',', $data["assignee"]);
            foreach ($assignees as $value) {
                Validation::validateField($value, "Invalid Attendee, please assign the lead to a person", $response, TRUE, "", "", TRUE, array(
                    array(
                        "invert" => TRUE,
                        "callback" => "AdminUser::isExistent",
                        "message" => "Invalid Attendee, please assign the lead to a person"
                    )
                ));
            }
        } else {
            Utility::ajaxResponseFalse("Invalid Attendee, please assign the lead to a person");
        }
    }

    if (!defined(("IS_LEAD_INDUSTRY_TYPE")) || getSettings("IS_LEAD_INDUSTRY_TYPE")) {
        if (!isset($data['industry-type'])) {
            Utility::ajaxResponseFalse("Invalid industry type, please select the corresponding category!");
        }
    }
    if (!defined('IS_LEAD_CONTACT_PERSON') || getSettings("IS_LEAD_CONTACT_PERSON")) {
        if (isset($data['lead-type-radio']) && ($data['lead-type-radio']) == 1) {
            if (isset($data['lead-type-radio'])) {
                if (isset($data['cp-is-owner']) && $data['cp-is-owner'] === '1') {
                    LeadManager::checkContactPersonDetails($data);
                }
            } else {
                LeadManager::checkContactPersonDetails($data);
            }
        }
    }

    if (!getSettings('IS_HIDE_LEAD_CURRENT_ADDRESS_DETAILS_ENABLED')) {
        if (trim($data['current-line1']) === "" && getSettings("IS_CUSTOMER_ADDR_LINE_1_MANDATORY")) {
            Utility::ajaxResponseFalse("Please enter line1 of current Address");
        }
        if (trim($data['current-line2']) === "" && getSettings("IS_CUSTOMER_ADDR_LINE_2_MANDATORY")) {
            Utility::ajaxResponseFalse("Please enter line2 of current Address");
        }
        if ($data['current-ctid'] === "" && getSettings("IS_CUSTOMER_ADDR_COUNTRY_MANDATORY")) {
            Utility::ajaxResponseFalse("Please select country of current Address");
        }
        if ($data['current-stid'] === "" && getSettings("IS_CUSTOMER_ADDR_STATE_MANDATORY")) {
            Utility::ajaxResponseFalse("Please select state of current Address");
        }

        if ($data['current-coverid'] === "" && getSettings("IS_CUSTOMER_ADDR_CITY_MANDATORY")) {
            Utility::ajaxResponseFalse("Please enter city of current Address");
        }

        if ($data['current-pincode'] === "" && getSettings("IS_CUSTOMER_ADDR_PIN_CODE_MANDATORY")) {
            Utility::ajaxResponseFalse("Please enter pincode of current Address");
        }
    }

    $schedule = FALSE;
    if (isset($data["schedule"]) && is_array($data["schedule"]) && $data["schedule"][0] == 1) {
        if (empty($data["scheduled-time"]) || empty($data["alert-time"])) {
            Utility::ajaxResponseFalse("Schedule and/or alert times can't be empty");
        }
        $current_time = date('Y-m-d H:i', time());
        $alert_time = $data['alert-time'];
        $schedule_time = $data['scheduled-time'];
        if ($alert_time < $current_time) {
            Utility::ajaxResponseFalse("Please provide valid alert time");
        }
        if ($alert_time >= $schedule_time) {
            Utility::ajaxResponseFalse("Alert time should be less than schedule time");
        }
        $schedule = TRUE;
    }


    $db = Rapidkart::getInstance()->getDB();
    $db->autoCommit(FALSE);

    $lead = new Lead();

    //        if (!defined(("IS_LEAD_COMPANY_NAME_MANDATORY")) || getSettings("IS_LEAD_COMPANY_NAME"))
    //        {
    //            $lead->setCompanyName($data["company-name"]);
    //        }
    if (!defined(("IS_LEAD_INDUSTRY_TYPE")) || getSettings("IS_LEAD_INDUSTRY_TYPE")) {
        $lead->setIndtid(($data["industry-type"]));
    }
    $fname = isset($data['fname']) ? $data['fname'] : "";
    $lname = isset($data['lname']) ? $data['lname'] : "";
    $company_name = isset($data["company-name"]) ? $data["company-name"] : '';
    if (getSettings("IS_CAPITAL_NAME")) {
        $fname = strtoupper($fname);
        $lname = strtoupper($lname);
        $company_name = strtoupper($company_name);
        //            $display_name = strtoupper($display_name);
    }
    if (getSettings("IS_NAME_SAVE_IN_CAMEL_CASE_ENABLE")) {
        $fname = ucwords(strtolower($fname));
        $lname = ucwords(strtolower($lname));
        $company_name = ucwords(strtolower($company_name));
        //            $display_name = ucwords(strtolower($display_name));
    }
    if (!defined("IS_LEAD_COMPANY_NAME") || getSettings("IS_LEAD_COMPANY_NAME")) {
        $lead->setCompanyName($company_name);
    }
    $lead->setCutid(isset($data['customer-type']) ? $data['customer-type'] : "");
    $lead->setCustid(isset($data['customer-sales-type']) ? $data['customer-sales-type'] : "");
    $lead->setFname($fname);
    $lead->setLname($lname);
    $lead->setDate(isset($data['lead_date']) ? $data['lead_date'] : "");
    $lead->setSalutationId(isset($data['salutation']) ? $data['salutation'] : 'NULL');
    $lead->setWebsite(isset($data['website']) ? $data['website'] : 'NULL');
    $lead->setGenderid(isset($data['gender']) ? $data['gender'] : 'NULL');
    $lead->setLeadPersonType(isset($data['lead-type-radio']) ? $data['lead-type-radio'] : 1);
    $lead->setLeatid(isset($data["lead-type"]) ? $data["lead-type"] : "");
    $lead->setSmstid($data['smstid'] > 0 ? $data['smstid'] : 'NULL');
    $lead->setEtid($data['etid'] > 0 ? $data['etid'] : 'NULL');
    $lead->setGstin(isset($data['gstin']) ? $data['gstin'] : '');
    $lead->setPan(isset($data['pan']) ? $data['pan'] : '');
    $lead->setAssignedUid(isset($data["assignee"]) && $data['assignee'] > 0 ? $data['assignee'] : 'NULL');
    $lead->setCity("");
    $lead->setOffAddr("");
    if (isset($data['leadoutlet'])) {
        $lead->setOutlid($data['leadoutlet'] > 0 ? $data['leadoutlet'] : 0);
        $outlet = new Outlet($data['leadoutlet']);
        $lead->setOutletName($outlet->getName());
    }
    $lead->setLeadSourceOther(isset($data['lead_type_value']) ? $data['lead_type_value'] : "");
    $lead->setDateOfBirth(isset($data['dob']) ? $data['dob'] : '');
    $lead->setDateOfAnniversary(isset($data['doa']) ? $data['doa'] : '');
    $lead->setBuildingStage(isset($data['stage']) ? $data['stage'] : '');
    $lead->setBuildingType(isset($data['build_type']) ? $data['build_type'] : '');
    $lead->setBuildingDescription(isset($data['build_desc']) ? $data['build_desc'] : '');
    $lead->setNoOfBedroom(isset($data['bedroom']) ? $data['bedroom'] : '');
    $lead->setNoOfBathroom(isset($data['bathroom']) ? $data['bathroom'] : '');
    $lead->setAadhar($aadhar);
    if (!defined(("IS_LEAD_REVENUE")) || getSettings("IS_LEAD_REVENUE")) {
        $lead->setRevenue($data["revenue"]);
    }
    if (!defined(("IS_LEAD_EMPLOYEE_STRENGTH")) || getSettings("IS_LEAD_EMPLOYEE_STRENGTH")) {
        $lead->setNoOfEmployee($data["no-of-emp"]);
    }

    $call = 1;
    if (isset($data['donot-call']) && is_array($data['donot-call']) && !empty($data['donot-call'])) {
        $call = 2;
    }
    $lead->setCallEnable($call);
    $catid = 0;
    $category_value = "";

    if (isset($data['leacatid']) && $data['leacatid']) {
        $catid = $data['leacatid'];
    }

    if (isset($data['category_value'])) {
        $category_value = $data['category_value'];
    }
    $lead_heat = "";
    if (isset($data['leadheat'])) {
        $lead_heat = $data['leadheat'];
    }
    $lead->setLeacatid($catid);
    $lead->setLeadHeat($lead_heat);

    $lead->setCategoryValue($category_value);

    $doseries = 0;
    if (isset($data['doseries']) && $data['doseries'] > 0) {
        $doseries = $data['doseries'];
    }
    if ($doseries > 0) {
        $lead->setDoserid($doseries);
        $series_no = $data['number'];

        $doc_number_fetch = DocumentSeriesManager::getSeriesNumber($lead->getDate(), $doseries, NULL, $lead->getOutlid(), Null, "Lead", 0, 0, 0);
        $series_no = $doc_number_fetch['count'];

        $prefixs = $doc_number_fetch['prefix'] . $series_no . $doc_number_fetch['postfix'];
        $lead->setDocNumber($prefixs);

        $lead->setSequenceNumber($series_no);
    }

    //        $referal_type = $data['referal-type'];
    //        $referal = $data['referral-leaid'];
    //        if (isset($referal_type) && valid($referal_type))
    //        {
    //            $referral_codeid = isset($data["referral-contact-detail"]) ? $data["referral-contact-detail"] : 'NULL';
    //            $lead->setReferralCodeid($referral_codeid);
    //            switch ($referal_type)
    //            {
    //
    //                case "customer":
    //                    $lead->setReferralCuid($referal);
    //                    break;
    //                case "lead":
    //                    $lead->setReferralLeaid($referal);
    //                    break;
    //                case "vendor":
    //                    $lead->setReferralVenid($referal);
    //
    //                    break;
    //                case "other":
    //                    $lead->setReferralSorefid($referal);
    //                    break;
    //                default:
    //                    $lead->setReferralCodeid('NULL');
    //                    break;
    //            }
    //        }

    $lead->setCreatedUid(Session::loggedInUid());
    $lead->setLeasid(1);
    $lead->setSpecialInstructions($data["special-instructions"]);
    $lead->setData(json_encode($attributes));
    if (getSettings("IS_MARKETING_PERSON_IS_ENABLED")) {
        $lead->setMarketingPerson(isset($data["marketing-person"]) && $data['marketing-person'] > 0 ? $data['marketing-person'] : 'NULL');
    }

    if (isset($data['company-mobile']) && valid($data['company-mobile'])) {
        if (getSettings("IS_LEAD_MOBILE_UNIQUE")) {
            if (!$lead->isMobileNotAvailable($data['company-mobile'])) {
                Utility::ajaxResponseFalse("Mobile Number Already Exists");
            }
        }
        $lead->setMobile(trim($data['company-mobile']));
    }
    if (isset($data['company-email']) && valid($data['company-email'])) {
        $lead->setLead_email(trim($data['company-email']));
    }


    if (getSettings("IS_LEAD_NAME_UNIQUE")) {
        if ($lead->getCompanyName() != '') {
            $company_name = $lead->getCompanyName();
            $first_name = FALSE;
            $last_name = FALSE;
        } else {
            $first_name = $lead->getFname();
            $last_name = $lead->getLname();
            $company_name = FALSE;
        }
        if (LeadManager::isLeadNameAvailable($company_name, $first_name, $last_name, $lead->getId())) {
            $db->rollBack();
            $db->autoCommit(TRUE);
            Utility::ajaxResponseFalse("Lead Name Already Exists");
        }
    }

    if (!$lead->insert()) {
        $d = $db->getMysqlError() . " " . $db->getLastQuery();
        $db->rollBack();
        $db->autoCommit(TRUE);
        Utility::ajaxResponseFalse("Failed to add the lead, please try after reloading the page!" . $d);
    }
    if ($lead->getId() && isset($data["assignee"]) && $data['assignee'] > 0) {
        $assignedUids = explode(',', $data["assignee"]);
        $mappingLeadUser = LeadManager::updateLeadUser($lead->getId(), $assignedUids);
        if (!$mappingLeadUser) {
            $db->rollBack();
            $db->autoCommit(true);
            Utility::ajaxResponseFalse('Failed to update Lead assignee');
        }
    }

    $terms_array = array();
    if (isset($data['terms_array'])) {
        $terms_array = $data['terms_array'];
    }
    TermsConditionsStaticManager::insertValueMapping($terms_array, $qoid = null, $chkoid = null, $invid = NULL, $purorid = null, $pinvid = null, $delete = false, $db, $lead->getId());

    $owner_id = NULL;
    $contact_id = NULL;

    if (!defined('IS_LEAD_CONTACT_PERSON') || getSettings("IS_LEAD_CONTACT_PERSON")) {
        foreach ($data["contact-person"] as $person) {
            if ($person["cp-name"] !== "") {
                $contact_person = new ContactDetail();

                $contact_person->setLeaid($lead->getId());
                $contact_person->setName($person["cp-name"]);
                $contact_person->setEmail($person["cp-email"]);
                $contact_person->setPhoneNo($person["cp-phone-no"]);
                $contact_person->setDepartment($person["cp-department"]);
                $contact_person->setDesignation($person["cp-designation"]);
                $attrs = array();
                foreach ($person as $key => $attr) {
                    if (strpos($key, "lead-attribute-") === 0) {
                        $attr_arr = explode("-", $key);
                        $attrs[$attr_arr[2]] = $attr;
                    } else if (strpos($key, "attribute-") === 0) {
                        $attr_arr = explode("-", $key);
                        $attrs[$attr_arr[1]] = $attr;
                    }
                }

                $contact_person->setData(json_encode($attrs));
                if (!$contact_person->insert()) {
                    $db->rollBack();
                    $db->autoCommit(TRUE);
                    Utility::ajaxResponseFalse("Failed to add the lead contact person");
                }

                if (isset($person["cp-is-owner"]) && $person["cp-is-owner"]) {
                    $owner_id = $contact_person->getId();
                }
                if (isset($data["followup-person"]) && $data["followup-person"] == $person["cp-id"]) {
                    $contact_id = $contact_person->getId();
                }
            }
        }

        if (getSettings("IS_CONTACT_DETAILS_OWNER_MANDATORY")) {
            if (!$owner_id) {
                $db->rollBack();
                $db->autoCommit(TRUE);
                Utility::ajaxResponseFalse("Please select a owner");
            }
        }
        $lead->setOwnerId($owner_id);
        if (!$lead->update()) {
            $db->rollBack();
            $db->autoCommit(TRUE);
            Utility::ajaxResponseFalse("Failed to map the owner to the lead!");
        }
    }

    if ($schedule) {
        $followup = new Followup();

        $followup->setLeaid($lead->getId());
        $followup->setScheduledDate(date('Y-m-d H:i:s', strtotime(str_replace('-', '/', $data["scheduled-time"]))));
        $followup->setAlertOn(date('Y-m-d H:i:s', strtotime(str_replace('-', '/', $data["alert-time"]))));
        $followup->setCommid(isset($data["communication-mode"]) ? $data["communication-mode"] : "NULL");
        $followup->setCodeid($contact_id);
        $followup->setAssignedUid(isset($data["followup-assignee"]) ? $data["followup-assignee"] : $data["assignee"]);
        $followup->setCreatedUid(Session::loggedInUid());
        $followup->setFosid(SystemTablesStatus::DB_TBL_FOLLOWUP_STATUS_PENDING);
        $followup->setLeadHeat($lead_heat);
        $followup->setAlertMode(SystemTablesStatus::DB_TBL_FOLLOWUP_ALERT_MODE_NONE);
        if (isset($data["alert-mode"]) && is_array($data["alert-mode"])) {
            foreach ($data["alert-mode"] as $mode) {
                $followup->setAlertMode($followup->getAlertMode() + $mode);
            }
        }
        if (getSettings("IS_LEAD_FOLLOWUP_ALERT_MODE_MANDATORY") && $followup->getAlertMode() == SystemTablesStatus::DB_TBL_FOLLOWUP_ALERT_MODE_NONE) {
            $db->rollBack();
            $db->autoCommit(TRUE);
            Utility::ajaxResponseFalse("Please Select Alert Mode");
        }
        if (!$followup->insert()) {
            $db->rollBack();
            $db->autoCommit(TRUE);
            Utility::ajaxResponseFalse("Failed to schedule the followup");
        }
        $lead->setLeasid(2);
        if (!$lead->update()) {
            $db->rollBack();
            $db->autoCommit(TRUE);
            Utility::ajaxResponseFalse("Fail to insert lead");
        }
    }

    //        if (isset($data['current-line1']) && $data['current-line1'] !== '')
    {
        $fname = "";
        $lname = "";
        $mobile = "";
        $site_name = "";
        if (isset($data['current-add-fname']) && $data['current-add-fname'] !== "") {
            $fname = $data['current-add-fname'];
        }
        if (isset($data['current-add-lname']) && $data['current-add-lname'] !== "") {
            $lname = $data['current-add-lname'];
        }
        if (isset($data['current-add-mobile']) && $data['current-add-mobile'] !== "") {
            $mobile = $data['current-add-mobile'];
        }
        if (isset($data['current-add-sitename']) && $data['current-add-sitename'] !== "") {
            $site_name = $data['current-add-sitename'];
        }
        if (!getSettings('IS_HIDE_LEAD_CURRENT_ADDRESS_DETAILS_ENABLED')) {
            $city = $data['current-coverid'];
            $address = new ShippingAddress();
            $address->setFirstName($fname);
            $address->setLastName($lname);
            $address->setMobile($mobile);
            $address->setSiteName($site_name);
            $address->setCity($city);
            $address->setCtid($data['current-ctid']);
            $address->setLine1($data['current-line1']);
            $address->setLine2($data['current-line2']);
            $address->setStid($data['current-stid']);
            $address->setZipCode($data['current-pincode']);
            $address->setSatid(isset($data['current-satid']) ? $data['current-satid'] : 3);
            $address->setArea(isset($data['current-area']) ? $data['current-area'] : "");
            $address->setGstIn(isset($data['current-gstin']) ? $data['current-gstin'] : "");
            if (getSettings("IN_LEAD_TALUKA_IS_ENABLED")) {
                $address->setTaluka(isset($data['current-taluka']) ? $data['current-taluka'] : '');
            }

            if (getSettings("IN_LEAD_DISTRICT_IS_ENABLED")) {
                $address->setDistrict(isset($data['current-district']) ? $data['current-district'] : "");
            }
            $address->setSasid(1);

            if (getSettings('IS_ROUTE_ENABLE')) {
                $address->setRid((isset($data['current-routeid']) && $data['current-routeid'] > 0) ? $data['current-routeid'] : '0');
            }

            $address->setLeaid($lead->getId());
            if (!$address->insert()) {
                $db->rollBack();
                $db->autoCommit(TRUE);
                Utility::ajaxResponseFalse("Fail to add shipping Address");
            }
            $coverage = new Coverage($city);
            $lead->setCity($coverage->getCity());
            $lead->setOffAddr($address->getLine1() . " " . $address->getLine2());
        }
        if (!$lead->update()) {
            $db->rollBack();
            $db->autoCommit(FALSE);
            Utility::ajaxResponseFalse("Fail to update lead");
        }
    }
    $reference_insert = 0;
    // adding lead system references
    if ($lead->getLeatid() == 8 && empty($data['lead-sources-combo'][0]['referral-leaid'])) {
        $db->rollBack();
        $db->autoCommit(TRUE);
        Utility::ajaxResponseFalse("Lead Reference is Mandatory");
    }
    if ((isset($data['lead-sources-combo']) && is_array($data['lead-sources-combo']) && !empty($data['lead-sources-combo']))) {
        if (SystemReference::isExistent(NULL, NULL, $lead->getId())) {
            SystemReference::delete(NULL, NULL, $lead->getId());
        }
        foreach ($data['lead-sources-combo'] as $referr) {
            $referal_type = trim($referr['type']);
            if (strlen($referal_type) > 0) {
                $referal_id = intval($referr['referral-leaid']);
                $referral_codeid = isset($referr["referral-contact-detail"]) ? $referr["referral-contact-detail"] : 'NULL';
                $systemReference = new SystemReference();
                $systemReference->setCodeid($referral_codeid);
                $systemReference->setLeaid($lead->getId());
                switch ($referal_type) {
                    case "customer":
                        $systemReference->setRef_cuid($referal_id);
                        $referralObj = new Customer($referal_id);
                        $systemReference->setName($referralObj->getName());
                        $systemReference->setEmail($referralObj->getEmail());
                        $systemReference->setMobile($referralObj->getMobile());
                        $systemReference->setSreftid(SystemTablesStatus::DB_TBL_SYSTEM_REFERENCES_TYPE_CUSTOMER);
                        break;
                    case "lead":
                        $systemReference->setRef_leaid($referal_id);
                        $referralObj = new Lead($referal_id);
                        $systemReference->setName($referralObj->getName());
                        $systemReference->setEmail($referralObj->getLead_email());
                        $systemReference->setMobile($referralObj->getMobile());
                        $systemReference->setSreftid(SystemTablesStatus::DB_TBL_SYSTEM_REFERENCES_TYPE_LEAD);
                        break;
                    case "vendor":
                        $systemReference->setRef_venid($referal_id);
                        $referralObj = new Vendor($referal_id);
                        $systemReference->setName($referralObj->getName());
                        $systemReference->setEmail($referralObj->getVendorEmail());
                        $systemReference->setMobile($referralObj->getMobile());
                        $systemReference->setSreftid(SystemTablesStatus::DB_TBL_SYSTEM_REFERENCES_TYPE_VENDOR);
                        break;
                    case "other":
                    case "influencer":
                        $systemReference->setRef_sorefid($referal_id);
                        $refname = SystemReference::getSystemOtherReferenceName($referal_id);
                        $referralObj = new SystemOtherReferences($referal_id);
                        $systemReference->setName($refname);
                        $systemReference->setMobile($referralObj->getMobile());
                        $systemReference->setSreftid(SystemTablesStatus::DB_TBL_SYSTEM_REFERENCES_TYPE_OTHER);
                        break;
                    default:
                        break;
                }
                $reference_insert = 1;
                if (!$systemReference->insert()) {
                    $db->rollBack();
                    $db->autoCommit(TRUE);
                    Utility::ajaxResponseFalse("Unable to add the reference person, try again later..!");
                }
            }
        }
    }


    if ($reference_insert == 0) {

        if (isset($data["lead-type"]) && $data["lead-type"] == 31) {
            $db->rollBack();
            $db->autoCommit(TRUE);
            Utility::ajaxResponseFalse("Since you have selected source as Reference, please provide atleast one reference for this lead...!");
        }
    }



    if ($lead->getAssignedUid() > 0) {
        $assignee_arr = explode(',', $lead->getAssignedUid());
        foreach ($assignee_arr as $assignee) {
            $message = "";
            $subject_original = "";
            $email_templates = EmailTemplateManager::loadEmailTemplate(28, 1);
            $user_id = new AdminUser($assignee);
            $user_email = $user_id->getEmail();

            if (is_array($email_templates) && count($email_templates) > 0) {
                $e = reset($email_templates);
                $etid = $e->getId();
                $email_template = new EmailTemplate($etid);
                $subject_original = $email_template->getSubject();
                $message = $email_template->getBody();
            }
            $placeholders = LeadManager::getPlaceholders($lead);

            if (isset($lead) && is_object($lead)) {
                if (isset($etid) && $etid > 0) {
                    if (isset($placeholders) && is_array($placeholders) && !empty($placeholders)) {
                        $subject = $subject_original;
                        foreach ($placeholders as $value) {
                            if (isset($value['callback'])) {
                                $message1 = call_user_func($value['callback'], $value['value']);
                                $message = str_replace($value['string'], $message1, $message);
                                $subject = str_replace($value['string'], $message1, $subject);
                            }
                        }
                    }

                    $email_content = array("user_id" => $user_id, "email" => $user_email, 'message' => $message, 'subject' => $subject);
                    LeadManager::send_mail($email_content, $email_template);
                }
            }
        }
    }


    $str = "";
    $message = "";
    $subject_original = "";
    $sms_templates = SmsTemplateManager::loadSmsTemplates(32, 1);
    $email_templates = EmailTemplateManager::loadEmailTemplate(32, 1);
    if (is_array($sms_templates) && count($sms_templates) > 0) {
        $s = reset($sms_templates);
        $smstid = $s->getId();
        $sms_template = new SmsTemplate($smstid);
        $str = $sms_template->getBody();
    }
    if (is_array($email_templates) && count($email_templates) > 0) {
        $e = reset($email_templates);
        $etid = $e->getId();
        $email_template = new EmailTemplate($etid);
        $subject_original = $email_template->getSubject();
        $message = $data['preview'];
    }
    $placeholders = LeadManager::getPlaceholders($lead);

    if (isset($lead) && is_object($lead)) {
        if (isset($smstid) && $smstid > 0 && isset($data['smstid']) && $data['smstid'] > 0) {

            if (isset($placeholders) && is_array($placeholders) && !empty($placeholders)) {
                foreach ($placeholders as $value) {
                    if (isset($value['callback'])) {
                        $sms_string = substr(call_user_func($value['callback'], $value['value']), 0, 30);
                        $str = trim(str_replace($value['string'], $sms_string, trim($str)));
                    }
                }
            }
            $str_replace_array = array("", "", "%20", "%20", "", "", "%20");
            $str_search_array = array("<p>", "</p>", "&nbsp;", " ", "<pre>", "</pre>", "\t");
            $str = trim(html_entity_decode($str));
            $strs = str_replace($str_search_array, $str_replace_array, $str);
            //                $sms = Sms::sendVerificationSMS($strs, $lead->getMobile());
            $log_string = json_encode(array('Lead Id' => $lead->getId()));
            $smslid = SmsLogManager::sendSmssaveLog($strs, $lead->getMobile(), '', $log_string, null, FALSE, null, '', $smstid);
            //                if (!$sms)
            //                {
            ////                    $db->rollBack();
            ////                    $db->autoCommit(TRUE);
            ////                    Utility::ajaxResponseFalse("Fail to send sms");
            //                }
        }


        if (isset($etid) && $etid > 0 && isset($data['etid']) && $data['etid'] > 0) {
            if (isset($placeholders) && is_array($placeholders) && !empty($placeholders)) {
                $subject = $subject_original;
                foreach ($placeholders as $value) {
                    if (isset($value['callback'])) {
                        $message1 = call_user_func($value['callback'], $value['value']);
                        $message = str_replace($value['string'], $message1, $message);
                        $subject = str_replace($value['string'], $message1, $subject);
                    }
                }
            }

            $email_content = array("email" => $lead->getLead_email(), 'message' => $message, 'subject' => $subject);
            LeadManager::send_mail($email_content, $email_template);
        }
    }
    if (getSettings("IS_SITE_DETAILS_ENABLE_FOR_LEAD") || getSettings("IS_LEAD_UPLOAD_FILE_ENABLE")) {
        if (isset($data['image_upload']) && !empty($data['image_upload'])) {
            foreach ($data['image_upload'] as $a) {
                $original_name = isset($a['actual_name']) ? $a['actual_name'] : '';
                $link = isset($a['downloadLink']) ? $a['downloadLink'] : "";
                $image = isset($a['uploaded_name']) ? $a['uploaded_name'] : '';

                $width = $height = 0;
                if (!file_exists($link)) {
                    $link = BaseConfig::FILES_DIR . "lead/" . $image;
                    if (file_exists($link)) {
                        $arr_size = getimagesize($link);
                        if (isset($arr_size[0])) {
                            $width = $arr_size[0];
                        }
                        if (isset($arr_size[1])) {
                            $height = $arr_size[1];
                        }
                    }
                }
                if (!LeadManager::insertLeadPhotos($lead->getId(), $image, $original_name, $link, $width, $height)) {
                    $db->rollBack();
                    $db->autoCommit(TRUE);
                    Utility::ajaxResponseFalse("Failed to insert lead files ");
                }
            }
        }
    }


    $db->commit();
    $db->autoCommit(TRUE);
    if (defined('SYSTEM_MODULE_LEAD') && defined('SYSTEM_MODULE_TASK_LEAD_ADD_LEAD')) {

        //            $message = "Lead #".LeadManager::getFullId($lead->getId()) ." updated by user @". AdminUserManager::createInvoice(Session::loggedInUid());
        $message = array("Lead #%s created by user @%s", LeadManager::getFullId($lead->getId(), array('lead' => $lead->getId())), AdminUserManager::createInvoice(Session::loggedInUid()));
        ActivityManager::addUserActivity(SYSTEM_MODULE_LEAD, SYSTEM_MODULE_TASK_LEAD_ADD_LEAD, $message);
    }
    if ($data['modal']) {
        $data = array(
            "id" => $lead->getId(),
            "name" => $lead->getCompanyName()
        );
    } else {
        $data = JPath::fullUrl("lead/view");
    }

    Utility::ajaxResponseTrue("Lead added successfully", $data, NULL, FALSE);
}

/**
 * function upload_file
 *
 * @param mixed $files1
 * @param mixed $data2
 * @return void
 */
function upload_file($files1, $data2)
{

    $resp = new AjaxResponse(FALSE);

    $response = FileUploadManager::fileUpload($files, $id = "image-divs", "lead", "lead/", "", "", TRUE, FALSE, FALSE, TRUE);
    if (count($response['errors']) > 0) {
        Utility::ajaxResponseFalse("Fail to upload File", "Unable to upload");
    }
    Utility::ajaxResponseTrue("File Uploaded Successfully", $response);
}

/**
 * function delete_upload_file
 *
 * @param mixed $files1
 * @param mixed $data2
 *
 * @return void
 */
function delete_upload_file($files1, $data2)
{
    if (isset($data['uploaded_name'])) {
        $file = BaseConfig::FILES_DIR . "lead/" . $data['uploaded_name'];
        if (!file_exists($file)) {
            Utility::ajaxResponseFalse("Fail to remove files");
        }
        unlink($file);
    }
    Utility::ajaxResponseTrue("Files Removed Successfully");
}
