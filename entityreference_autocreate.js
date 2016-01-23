/**
 * Implements hook_form_alter().
 */


// Implement hook_form_alter() to detect entity edit forms

// Iterate over fields on the form, detecting entity reference fields, take note of them


function entityreference_autocreate_form_alter(&$form, &$form_state, $form_id) {
  if (isset($form['type']) && $form['type']['#value'] . '_node_settings' == $form_id) {
    $form['workflow']['upload_' . $form['type']['#value']] = array(
      '#type' => 'radios',
      '#title' => t('Attachments'),
      '#default_value' => variable_get('upload_' . $form['type']['#value'], 1),
      '#options' => array(t('Disabled'), t('Enabled')),
    );
  }
}






// Make a backup for the submit handlers on the current form


// Overwrite the submit handlers with a custom submit handler



// In this submit handler, use the jDrupal API to create the entity for the desired field


// var node = {
//  title: "Hello World",
//  type: "article"
	//};
// node_save(node, {
//  success: function(result) {
//    alert("Saved node #" + result.nid);
//  }
// });



// then stick the newly created entity id into the form state values





// when all entities have been create, let the form submission handlers you set aside, run as usual






/**
 * Adjust the behaviour of entityreference autocomplete widgets.
 *
 * Replaces the normal validation that prevents linking to imaginary entities
 * with our own, which makes it on the fly if needed.
 *
 * hook_field_widget_form_alter()
 */
function entityreference_autocreate_field_widget_form_alter(&$element, &$form_state, $context) {
  // First check if we are relevant or needed on this field widget.
  if ($context['field']['type'] != 'entityreference') {
    return;
  }
  if (empty($context['instance']['widget']['settings']['entityreference_autocreate']['active'])) {
    return;
  }

  // We are an autocomplete. What's the details?
  $target_bundles = $context['field']['settings']['handler_settings']['target_bundles'];
  // So, not all entites have bundles. 'user' doesn't. Fake it for now.
  if (empty($target_bundles)) {
    $target_bundles = array($context['field']['settings']['target_type']);
  }
  if (count($target_bundles) != 1) {
    watchdog('entityreference_autocreate', 'Can only autocreate an entity if there is exactly one target bundle.', array(), WATCHDOG_NOTICE);
    return;
  }

  $title = t('Autocreate enabled - any title put here will cause a "!bundle" to be created if no autocomplete match is found.', array('!bundle' => reset($target_bundles)));

  // So adjust the form field now.
  if ($context['instance']['widget']['type'] == 'entityreference_autocomplete') {
    // If it's autocomplete standard, there is a 'target_id'
    $element['target_id']['#attributes']['title'] = $title;
    $element['target_id']['#entityreference_autocreate_settings'] = $context['instance']['widget']['settings']['entityreference_autocreate'];
    // To bypass the normal validation, need to REPLACE it totally.
    $element['target_id']['#element_validate'] = array('entityreference_autocreate_validate');
  }

  if ($context['instance']['widget']['type'] == 'entityreference_autocomplete_tags') {
    // If it's autocomplete tags style ..
    $element['#attributes']['title'] = $title;
    $element['#entityreference_autocreate_settings'] = $context['instance']['widget']['settings']['entityreference_autocreate'];
    // To bypass the normal validation, need to REPLACE it totally.
    $element['#element_validate'] = array('entityreference_autocreate_validate_tags');
  }
}


/**
 * Make a missing target if asked for by name.
 *
 * An element_validate callback for autocomplete fields.
 * Replaces _entityreference_autocomplete_validate().
 *
 * @see _entityreference_autocomplete_validate()
 */
function entityreference_autocreate_validate($element, &$form_state, $form) {
  if (empty($element['#value'])) {
    return;
  }
  $field = field_info_field($element['#field_name']);
  $field['settings']['entityreference_autocreate'] = $element['#entityreference_autocreate_settings'];

  // Fetch an entity ID, making it on the fly if needed.
  if ($value = entityreference_autocreate_get_entity_by_title($field, $element['#value'])) {
    form_set_value($element, $value, $form_state);
    return;
  }

  // Something has failed.
  // Either could not create the target
  // (permissions or something?)
  // Or did a lookup and found two identically named targets already existing,
  // so bailed.

  $strings = array(
    '!target' => $element['#value'],
  );
  form_error($element, t('Failed to create or find a target called !target (entityreference_autocreate). This may be due to permissions, or possibly if there are two targets with identical titles already on the system.', $strings));
}

/**
 * Validate handler that makes things up on the fly if needed.
 *
 * @see _entityreference_autocomplete_tags_validate()
 */
function entityreference_autocreate_validate_tags($element, &$form_state, $form) {
  $value = array();
  // If a value was entered into the autocomplete...
  if (!empty($element['#value'])) {
    $field = field_info_field($element['#field_name']);
    $field['settings']['entityreference_autocreate'] = $element['#entityreference_autocreate_settings'];
    $entities = drupal_explode_tags($element['#value']);
    foreach ($entities as $title) {
      if ($target_id = entityreference_autocreate_get_entity_by_title($field, $title)) {
        $value[] = array(
          'target_id' => $target_id,
        );
      }
    }
  }
  // Update the values.
  form_set_value($element, $value, $form_state);
}

/**
 * Fetch the named entity for the field, create it if not found.
 *
 * @param array $field_info
 *   As loaded from field_info_field()
 * @param string $title
 *   Title to search for.
 *
 * @return object|NULL
 *   Pre-existing or new entity. is_new should be set on it if it is fresh.
 *   Returns NULL on unexpected failure. A failure should probably be caught.
 */
function entityreference_autocreate_get_entity_by_title($field_info, $title) {

  if (strstr($title, ',')) {
    // Problem?
    // dpm("Title '$title has commas - this may be a problem'");
    // dpm(debug_backtrace());
    return NULL;
  }

  $title = trim($title);
  if (empty($title)) {
    return NULL;
  }

  // Take "label (entity id)', match the id from parenthesis.
  if (preg_match("/.+\((\d+)\)/", $title, $matches)) {
    return $matches[1];
  }

  // Try to get a match from the input string when the user didn't use the
  // autocomplete but filled in a value manually.
  $handler = entityreference_get_selection_handler($field_info);

  // Search for matches (exact), limit to 2 so we can detect if there is a
  // potential conflict.
  $entities = $handler->getReferencableEntities($title, '=', 2);

  // Case where $entities looks like $entites[BUNDLE][ETID] = TITLE.
  if (is_array(reset($entities))) {
    // Extract items from results. The return is keyed by bundle.
    $target_bundles = $field_info['settings']['handler_settings']['target_bundles'];
    $tmp = array();
    foreach ($target_bundles as $bundle) {
      $tmp += $entities[$bundle];
    }

    // User entities are special - they have no bundle.
    // (or it's 'user' but not explicit about it in the entityreference options)
    // I guess there may be other entities like that also. Try to catch them,
    // by assuming that their entity type and their bundle id are the same.
    if (empty($target_bundles)) {
      $bundle = $field_info['settings']['target_type'];
      $tmp += $entities[$bundle];
    }
    $entities = $tmp;
  }

  if (count($entities) == 1) {
    // Exact match, no confusion, use that.
    return key($entities);
  }

  if (count($entities) > 1) {
    // More than one match.
    // This is a genuine form validation error I can't automate.
    return NULL;
  }

  // By now we've eliminated the options. There is no match.
  if (count($entities) == 0) {
    // Now make one of the named things.
    return entityreference_autocreate_new_entity($field_info, $title);
  }
  return NULL;
}

/**
 * Create a placeholder item of the type described in the field settings.
 */
function entityreference_autocreate_new_entity($field_info, $title) {
  // Now make one of the named things.
  $entity_type = $field_info['settings']['target_type'];
  $target_bundle = reset($field_info['settings']['handler_settings']['target_bundles']);

  // Select user depending on settings.
  if (!empty($field_info['settings']['entityreference_autocreate']['author_current_user'])) {
    global $user;
  }
  elseif (!empty($field_info['settings']['entityreference_autocreate']['author'])) {
    $user = user_load_by_name($field_info['settings']['entityreference_autocreate']['author']);
  }
  else {
    $user = user_load(0);
  }

  // Make a skeleton/minimal whatever entity. Probably a node.
  // @see entity_create_stub_entity($entity_type, $ids).

  $entity_info = entity_get_info($entity_type);
  $label_key = 'title';
  if (!empty($entity_info['entity keys']['label'])) {
    $label_key = $entity_info['entity keys']['label'];
  }
  $bundle_key = 'type';
  if (!empty($info['entity keys']['bundle'])) {
    $bundle_key = $info['entity keys']['bundle'];
  }

  $new_entity = NULL;
  // These two attributes seem common to each entity I've met so far.
  $new_entity_values = array(
    $bundle_key => $target_bundle,
    $label_key => $title,
  );

  switch ($entity_type) {
    case 'node':
      // Check the expected published status.
      $status = TRUE;
      if (isset($field_info['settings']['entityreference_autocreate']['status'])) {
        $status = $field_info['settings']['entityreference_autocreate']['status'];
        if ($status == -1) {
          // Use the bundle default.
          $node_options = variable_get('node_options_' . $target_bundle, array('status', 'promote'));
          $status = in_array('status', $node_options);
        }
      }

      $new_entity_values += array(
        'uid' => $user->uid,
        'name' => (isset($user->name) ? $user->name : ''),
        'language' => LANGUAGE_NONE,
        'status' => $status,
      );
      $new_entity = entity_create($entity_type, $new_entity_values);

      break;

    case 'taxonomy_term':
      if ($vocabulair = taxonomy_vocabulary_machine_name_load($target_bundle)) {
        $new_entity_values += array(
          'vid' => $vocabulair->vid,
        );
        $new_entity = entity_create($entity_type, $new_entity_values);
      }
      break;

    case 'user':
      // Creating users on the fly is a bit risky,
      // so they are not enabled by default.
      //
      // Entity_info did not define the label_key,
      // and users dont really have bundles.
      $label_key = 'name';
      $target_bundle = 'user';
      $new_entity_values = array(
        $bundle_key => $target_bundle,
        $label_key => $title,
      );
      $new_entity = entity_create($entity_type, $new_entity_values);

      break;

    default:
      // It's some unknown/custom entity.
      // We really can't guess what shape it is.
      // It's likely that each field listed in the infos
      // $entity_info['entity keys']
      // will be required though?
      //
      // It's probably a *little* like a node...
      // but it's a crap-shoot really.
      // Hopefully entity API will take care of the rest of the abstraction
      // and validation needed from here.
      // YMMV.
      $new_entity = entity_create($entity_type, $new_entity_values);
      break;

  }

  drupal_alter('entityreference_autocreate_new_entity', $new_entity, $field_info, $title);

  if (empty($new_entity)) {
    // The entity is unknown so don't continue.
    drupal_set_message(t("The entity that needs to be created is unknown (entityreference_autocreate)"), 'error');
    return NULL;
  }

  entity_save($entity_type, $new_entity);

  // The return from this isn't reliable, check for an ID instead.
  $target_id = entity_id($entity_type, $new_entity);
  $uri = entity_uri($entity_type, $new_entity);
  $strings = array(
    '%entity_type' => $entity_type,
    '%target_bundle' => $target_bundle,
    '!target' => l($new_entity->$label_key, $uri['path']),
    '%title' => $title,
  );
  if ($target_id) {
    drupal_set_message(t('Created a new %entity_type %target_bundle : !target (entityreference_autocreate)', $strings));
    return $target_id;
  }
  else {
    // Can't say why, but it's probably worth complaining about.
    drupal_set_message(t("Failed to created a new %target_bundle called %title, no id returned (entityreference_autocreate)", $strings), 'error');
    return NULL;
  }
}

/**
 * Load feeds support.
 *
 * Implements hook_init().
 */
function entityreference_autocreate_init() {
  // Include feeds.module integration.
  if (module_exists('feeds')) {
    module_load_include('inc', 'entityreference_autocreate', 'entityreference_autocreate.feeds');
  }
}
