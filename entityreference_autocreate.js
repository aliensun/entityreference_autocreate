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


var node = {
  title: "Hello World",
  type: "article"
};
node_save(node, {
  success: function(result) {
    alert("Saved node #" + result.nid);
  }
});



// then stick the newly created entity id into the form state values





// when all entities have been create, let the form submission handlers you set aside, run as usual
