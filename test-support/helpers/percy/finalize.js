import Ember from 'ember';

export default function() {
  Ember.run(function() {
    Ember.$.ajax('/_percy/finalize_build', {
      method: 'POST',
    });
  });
}