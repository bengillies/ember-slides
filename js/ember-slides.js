App = Em.Application.create();

App.Router.map(function() {
	this.resource('slides', function() {
		this.resource('slide', { path: '/:id' });
	});
});

App.IndexRoute = Em.Route.extend({
	beforeModel: function() {
		this.transitionTo('slides');
	}
});

App.SlidesRoute = Em.Route.extend({
	model: function() {
		return Em.RSVP.all(App.slides.map(function(slide) {
			return $.get('slides/' + slide + '.md');
		})).then(function(slides) {
			return slides.map(function(slide, index) {
				return App.Slide.create({
					id: App.slides[index],
					raw: slide
				});
			});
		});
	}
});

App.SlidesIndexRoute = Em.Route.extend({
	model: function() {
		return this.modelFor('slides');
	},
	actions: {
		lastActiveSlide: function() {
			var slide = this.modelFor('slide') || this.modelFor('slides').objectAt('0');
			this.transitionTo('slide', slide);
		}
	}
});

App.SlideRoute = Em.Route.extend({
	model: function(params) {
		return this.modelFor('slides').findBy('id', parseInt(params.id, 10));
	},
	shiftSlide: function(slide, diff) {
		var slides = this.modelFor('slides'),
			newIndex = slides.indexOf(slide) + diff,
			nextSlide = slides.objectAt(newIndex);

		if (nextSlide) {
			this.transitionTo('slide', nextSlide);
		}
	},
	actions: {
		nextSlide: function() {
			this.shiftSlide(this.modelFor('slide'), 1);
		},
		previousSlide: function() {
			this.shiftSlide(this.modelFor('slide'), -1);
		}
	}
});

App.SlidesController = Em.ArrayController.extend();
App.SlidesIndexController = Em.ArrayController.extend();
App.SlideController = Em.ObjectController.extend();

App.WindowListener = Em.Mixin.create({
	bindWindowEvents: function() {
		var events = this.get('windowEvents'),
			newEvents = {},
			self = this;

		$.each(events, function(name, fn) {
			newEvents[name] = fn.bind(self);
		});

		this.set('windowEvents', newEvents);
	}.on('init'),
	startListening: function() {
		var events = this.get('windowEvents');

		$.each(events, function(name, fn) {
			$(window).on(name.toLowerCase(), fn);
		});
	}.on('didInsertElement'),
	stopListening: function() {
		var events = this.get('windowEvents');

		$.each(events, function(name, fn) {
			$(window).off(name.toLowerCase(), fn);
		});
	}.on('destroyElement')
});

App.SlidesIndexView = Em.View.extend(App.WindowListener, {
	windowEvents: {
		keyUp: function(ev) {
			if (ev.which == 40) {
				this.get('controller').send('lastActiveSlide');
			}
		}
	}
});

App.SlideView = Em.View.extend(App.WindowListener, {
	didInsertElement: function() {
		this._super();
		this.setBodyClass();
	},
	scrollToTopObserver: Em.observer('controller.id', function() {
		Em.run.once(this, 'scrollToTop');
	}),
	scrollToTop: function() {
		window.scrollTo(0, 0);
	},
	recalcCodeObserver: Em.observer('controller.body', function() {
		Em.run.once(this, 'recalcCode');
	}),
	recalcCode: function() {
		var self = this;
		Em.run.next(function() {
			if (self.get('element')) {
				self.evalJavaScript();
				self.renderHandlebars();
			}
		});
	},
	evalJavaScript: function() {
		this.$('code.lang-javascript').each(function(i, el) {
			var raw = el.innerHTML.replace(/&gt;/g, '>').replace(/&lt;/g, '<');
			$.globalEval(raw);
		});
	},
	willDestroyElement: function() {
		this.removeBodyClass();
	},
	setBodyClass: function() {
		$(document.body).addClass('slide-' + this.get('controller.id'));
	},
	removeBodyClass: function() {
		$(document.body).removeClass('slide-' + this.get('controller.id'));
	},
	bodyClassObserver: function() {
		if (this.get('controller.id')) {
			$(document.body).removeClass(function(index, classNames) {
				return classNames.split(' ').filter(function(name) {
					return /^slide\-/.test(name);
				}).join(' ');
			}).addClass('slide-' + this.get('context.id'));
		}
	}.observes('controller.id'),
	renderCodeTemplate: function(template, el) {
		var view = Em.View.create({
			template: template,
			controller: this.get('controller')
		});

		view.rerender();
		view.appendTo(el);

		return view;
	},
	renderHandlebars: function() {
		var self = this;
		this.$('code.lang-handlebars').each(function(i, el) {
			var raw = el.innerHTML.replace(/&gt;/g, '>').replace(/&lt;/g, '<'),
				template = Em.Handlebars.compile(raw),
				$pre = $(el).closest('pre');

			$pre.wrap('<div class="code-runner"/>');
			$('<button/>')
				.text('run')
				.addClass('run btn')
				.insertAfter($pre)
				.on('click', function() {
					var $el = $(this);
					if ($el.text() == 'run') {
						$pre.hide();
						$el.text('source');
						var $block = $('<div class="rendered-block"/>')
							.insertBefore($pre);
						$el.data('view',
							self.renderCodeTemplate(template, $block));
					} else {
						$el.data('view').destroy()
						$pre.prev('.rendered-block').remove();
						$pre.show();
						$el.text('run');
					}
				});
		});
	},
	windowEvents: {
		keyUp: function(ev) {
			switch (ev.which) {
			case 39:
			case 32:
			case 13:
				this.get('controller').send('nextSlide');
				break;
			case 37:
				this.get('controller').send('previousSlide');
				break;
			case 38:
				this.get('controller').transitionToRoute('slides.index');
			}
		}
	}
});

App.Slide = Em.Object.extend({
	title: Em.computed('raw', function() {
		return this.get('raw').split('\n')[0];
	}),
	body: Em.computed('raw', function() {
		var raw = this.get('raw'),
			html = marked(raw);

		// sanitize: false only works in html blocks
		return html.replace(/&quot;/g, '"');
	})
});

Em.TEMPLATES = {
	'application': Em.Handlebars.compile('{{outlet}}'),
	'slides/index': Em.Handlebars.compile('<h1>Index</h1><ul>{{#each model}}<li>{{#link-to "slide" this}}{{id}}&mdash;{{title}}{{/link-to}}</li>{{/each}}</ul>'),
	'slide': Em.Handlebars.compile('{{{body}}}'),
}

App.marked = marked;
App.marked.setOptions({
	renderer: new marked.Renderer(),
	gfm: true,
	tables: true,
	breaks: false,
	pedantic: false,
	smartLists: true,
	sanitize: false
});
